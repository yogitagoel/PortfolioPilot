# XGBoost models: ReturnPredictor (predicts next-day expected log return), VolatilityPredictor (predicts next-day expected volatility)

from __future__ import annotations

import os
import numpy  as np
import pandas as pd
import joblib
from pathlib  import Path
from typing   import Optional

from sklearn.preprocessing  import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics        import mean_absolute_error, r2_score
from xgboost                import XGBRegressor

from backend.config          import get_settings
from backend.models.schemas  import AssetFeatures, MLPrediction
from backend.engines.feature_engineering import FeatureEngineer
from backend.models.schemas import MarketSnapshot

class _BaseXGBModel:
    MODEL_FILENAME:  str = "base.joblib"
    SCALER_FILENAME: str = "base_scaler.joblib"

    def __init__(self):
        self.settings  = get_settings()
        self.model:    Optional[XGBRegressor]  = None
        self.scaler:   Optional[StandardScaler] = None
        self.is_fitted = False
        self._model_path  = Path(self.settings.model_dir) / self.MODEL_FILENAME
        self._scaler_path = Path(self.settings.model_dir) / self.SCALER_FILENAME
        os.makedirs(self.settings.model_dir, exist_ok=True)
        self._try_load()

    def _try_load(self) -> None:

        # Attempt to load a previously trained model from disk
        if self._model_path.exists() and self._scaler_path.exists():
            self.model    = joblib.load(self._model_path)
            self.scaler   = joblib.load(self._scaler_path)
            self.is_fitted = True

    def _save(self) -> None:
        # Persist trained model + scaler to disk
        if self.model and self.scaler:
            joblib.dump(self.model,  self._model_path)
            joblib.dump(self.scaler, self._scaler_path)

    def _build_xgb(self) -> XGBRegressor:

        # XGBoost hyperparameters:
        #     n_estimators: number of boosting rounds
        #     learning_rate: step size shrinkage (lower = more robust)
        #     max_depth: depth of each tree (3-6 is usually best)
        #     subsample: row sampling ratio (reduces overfitting)
        #     colsample_bytree: feature sampling (reduces overfitting)
        #     reg_alpha/lambda: L1/L2 regularisation

        return XGBRegressor(
            n_estimators=200,
            learning_rate=0.05,
            max_depth=4,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_alpha=0.1,
            reg_lambda=1.0,
            random_state=42,
            verbosity=0,
            n_jobs=-1,
        )

    def _predict_single(self, features: list[float]) -> tuple[float, float]:
        if not self.is_fitted:
            raise RuntimeError(f"{self.__class__.__name__} is not trained yet.")
        X = self.scaler.transform([features])
        pred = float(self.model.predict(X)[0])

        # Confidence: use inverse of prediction variance across estimators
        # Approximated as a function of the training R² score clamped to [0.3, 0.95]
        confidence = min(0.95, max(0.3, getattr(self, "_train_r2", 0.5)))
        return pred, confidence

# Return Predictor
class ReturnPredictor(_BaseXGBModel):

    # Predicts the next-day log return for an asset.
    MODEL_FILENAME  = "return_predictor.joblib"
    SCALER_FILENAME = "return_predictor_scaler.joblib"

    def train(self, snapshots: dict[str, MarketSnapshot]) -> dict:

        # Train on ALL available symbols' historical data.
        X_list, y_list = [], []
        fe = FeatureEngineer()

        for symbol, snap in snapshots.items():
            if len(snap.history) < 80:
                continue
            closes = np.array([b.close for b in snap.history])
            log_returns = np.diff(np.log(closes))

            # Slide a window to build training samples
            for i in range(50, len(snap.history) - 1):
                sub_snap = MarketSnapshot(
                    symbol=symbol,
                    current_price=snap.history[i].close,
                    daily_return=0.0,
                    rolling_vol_20d=0.0,
                    history=snap.history[:i+1],
                )
                try:
                    feat = fe._compute_asset_features(
                        symbol=symbol,
                        df=fe._snapshot_to_df(sub_snap),
                        weight=0.5,
                        market_snapshot=None,
                    )
                    X_list.append(fe.features_to_vector(feat))
                    y_list.append(float(log_returns[i]))
                except Exception:
                    continue

        if len(X_list) < 50:
            return {"status": "insufficient_data"}

        X = np.array(X_list)
        y = np.array(y_list)

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, shuffle=False)

        self.scaler = StandardScaler()
        X_train_s = self.scaler.fit_transform(X_train)
        X_test_s = self.scaler.transform(X_test)

        self.model = self._build_xgb()
        self.model.fit(X_train_s, y_train, eval_set=[(X_test_s, y_test)], verbose=False)

        y_pred = self.model.predict(X_test_s)
        mae = mean_absolute_error(y_test, y_pred)
        r2 = r2_score(y_test, y_pred)
        self._train_r2 = max(0.0, r2)
        self.is_fitted = True
        self._save()
        metrics = {"samples": len(X_list), "mae": round(mae, 6), "r2": round(r2, 4)}
        return metrics

    def predict(self, features: AssetFeatures, fe: FeatureEngineer) -> tuple[float, float]:
        if not self.is_fitted:
            return features.log_return_1d, 0.3
        vec = fe.features_to_vector(features)
        return self._predict_single(vec)


# Volatility Predictor
class VolatilityPredictor(_BaseXGBModel):

    # Predicts the next-day realised volatility for an asset.
    MODEL_FILENAME  = "volatility_predictor.joblib"
    SCALER_FILENAME = "volatility_predictor_scaler.joblib"

    def train(self, snapshots: dict[str, MarketSnapshot]) -> dict:
        # Train on all available symbols
        X_list, y_list = [], []
        fe = FeatureEngineer()

        for symbol, snap in snapshots.items():
            if len(snap.history) < 80:
                continue
            closes      = np.array([b.close for b in snap.history])
            log_returns = np.diff(np.log(closes))

            # Rolling 20-day vol targets
            for i in range(50, len(snap.history) - 21):
                future_vol = float(np.std(log_returns[i:i+20]) * np.sqrt(252))
                sub_snap = MarketSnapshot(
                    symbol=symbol,
                    current_price=snap.history[i].close,
                    daily_return=0.0,
                    rolling_vol_20d=0.0,
                    history=snap.history[:i+1],
                )
                try:
                    feat = fe._compute_asset_features(
                        symbol=symbol,
                        df=fe._snapshot_to_df(sub_snap),
                        weight=0.5,
                        market_snapshot=None,
                    )
                    X_list.append(fe.features_to_vector(feat))
                    y_list.append(future_vol)
                except Exception:
                    continue

        if len(X_list) < 50:
            return {"status": "insufficient_data"}

        X = np.array(X_list)
        y = np.array(y_list)

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, shuffle=False)

        self.scaler = StandardScaler()
        X_train_s   = self.scaler.fit_transform(X_train)
        X_test_s    = self.scaler.transform(X_test)

        self.model = self._build_xgb()
        self.model.fit(X_train_s, y_train, eval_set=[(X_test_s, y_test)], verbose=False)

        y_pred = self.model.predict(X_test_s)
        mae = mean_absolute_error(y_test, y_pred)
        r2  = r2_score(y_test, y_pred)
        self._train_r2 = max(0.0, r2)
        self.is_fitted = True
        self._save()

        metrics = {"samples": len(X_list), "mae": round(mae, 6), "r2": round(r2, 4)}
        return metrics

    def predict(self, features: AssetFeatures, fe: FeatureEngineer) -> tuple[float, float]:
        if not self.is_fitted:
            return features.rolling_vol_20d, 0.3
        vec = fe.features_to_vector(features)
        return self._predict_single(vec)

# Unified ML Layer
class MLModelLayer:

    # Wraps both models
    def __init__(self):
        self.return_model = ReturnPredictor()
        self.vol_model    = VolatilityPredictor()
        self.fe           = FeatureEngineer()

    def predict_all(self, features_list: list[AssetFeatures]) -> list[MLPrediction]:
        # Run both models for each asset and return predictions
        predictions = []
        for feat in features_list:
            ret_pred, ret_conf = self.return_model.predict(feat, self.fe)
            vol_pred, vol_conf = self.vol_model.predict(feat, self.fe)

            # Combined confidence = geometric mean of both
            combined_conf = float(np.sqrt(ret_conf * vol_conf))
            predictions.append(MLPrediction(
                symbol=feat.symbol,
                predicted_return=round(ret_pred, 6),
                predicted_volatility=round(max(0.0, vol_pred), 6),
                confidence=round(combined_conf, 4),
            ))
        return predictions

    async def train_all(self, snapshots: dict[str, MarketSnapshot]) -> dict:
        # Train both models.
        import asyncio
        loop = asyncio.get_event_loop()

        ret_metrics = await loop.run_in_executor(None, self.return_model.train, snapshots)
        vol_metrics = await loop.run_in_executor(None, self.vol_model.train,   snapshots)

        return {
            "return_model":     ret_metrics,
            "volatility_model": vol_metrics,
        }

    @property
    def models_ready(self) -> bool:
        return self.return_model.is_fitted and self.vol_model.is_fitted
