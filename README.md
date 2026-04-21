# Portfolio Pilot

## Introduction
Portfolio Pilot is a financial portfolio analysis system designed to evaluate investment portfolios consisting of equities and options. The system integrates financial models, risk calculations, and data analysis techniques to provide insights into portfolio performance and risk exposure.

The application analyzes portfolio holdings by collecting market data, computing financial indicators, and applying mathematical models such as the Black-Scholes option pricing model. It helps users understand portfolio volatility, asset exposure, and potential risk levels.

The system follows a modular architecture where backend components handle financial computations while the frontend provides an interface for submitting portfolio data and viewing analysis results.

## Features
- Portfolio risk analysis based on market data
- Option pricing using the Black-Scholes model
- Calculation of portfolio volatility and covariance
- Financial return calculations using logarithmic returns
- Automated risk scoring for portfolios
- Portfolio exposure and notional value calculations
- Modular backend pipeline architecture
- User-friendly interface for portfolio evaluation

## Tech Stack

### Backend
Python – Core programming language  
FastAPI – Backend API framework  
NumPy – Numerical computations  
Pandas – Data analysis and data processing  

### Frontend
React – User interface development  
Vite – Frontend build tool  
Axios – API communication  

## Project Structure
Portfolio/
│
├── backend/
│   ├── risk_engine.py
│   ├── market_data.py
│   ├── feature_engineering.py
│   ├── ml_models.py
│   ├── risk_scoring.py
│   └── recommendation_engine.py
│
├── frontend/
│   ├── components/
│   ├── pages/
│   └── api/
│
├── main.py
├── requirements.txt
└── README.md

## Installation & Setup

Step 1: Clone the Repository

git clone <repository_url>  
cd portfolio  

Step 2: Install Dependencies

pip install -r requirements.txt  

Step 3: Start Backend Server

uvicorn main:app --reload  

Step 4: Run Frontend

npm install  
npm run dev  

## Usage / How to Use
1. Open the web interface.
2. Enter portfolio details including equities and options.
3. Submit the portfolio for analysis.
4. The system collects market data and performs financial calculations.
5. Risk metrics and portfolio insights are generated.
6. The results are displayed on the dashboard for analysis.

## Algorithms Implemented

### Log Return Calculation
Asset returns are calculated using logarithmic returns.

r_t = ln(P_t / P_t-1)

Where:

P_t = current price  
P_t-1 = previous price  

### Portfolio Volatility
Portfolio volatility measures the overall risk of a portfolio.

σ_p = √(wᵀ Σ w)

Where:

w = asset weight vector  
Σ = covariance matrix of asset returns  

This formula calculates the standard deviation of portfolio returns.

### Black-Scholes Option Pricing
Options are evaluated using the Black-Scholes pricing model.

C = S0 N(d1) − K e^(−rT) N(d2)

Where:

S0 = current stock price  
K = strike price  
T = time to maturity  
r = risk-free interest rate  

This model calculates the theoretical price of European call options.

These mathematical models help compute portfolio risk, expected returns, and theoretical pricing of financial options.

## Use Cases
- Portfolio risk assessment for investors
- Option pricing and analysis for traders
- Financial modeling for academic purposes
- Decision support for investment strategies

## Future Improvements
- Integration of real-time financial market APIs
- Advanced portfolio optimization algorithms
- More option pricing models
- Improved graphical dashboards
- Enhanced machine learning models
