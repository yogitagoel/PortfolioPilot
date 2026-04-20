import { useState, useEffect, useRef, useCallback } from 'react';
import {
  analysePortfolio, createSession, getSession,
  deleteSession, refreshSession, getHealth,
} from '../api/client';

const POLL_INTERVAL_MS = 60_000; 

export function useAnalysis() {
  const [result,      setResult]      = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [sessionId,   setSessionId]   = useState(null);
  const [liveMode,    setLiveMode]    = useState(false);
  const [lastUpdate,  setLastUpdate]  = useState(null);
  const [dataUpdatedAt, setDataUpdatedAt] = useState(null); // ISO from backend
  const [health,      setHealth]      = useState(null);
  const [refreshing,  setRefreshing]  = useState(false);
  const pollRef       = useRef(null);
  const sessionIdRef  = useRef(null); 
  const currentPortfolio = useRef(null);

  // For ref to be in sync with state
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // Health check on mount every 30s 
  useEffect(() => {
    const fetchHealth = () =>
      getHealth().then(setHealth).catch(() => setHealth({ status: 'unreachable' }));
    fetchHealth();
    const hid = setInterval(fetchHealth, 30_000);
    return () => clearInterval(hid);
  }, []);

  // One-shot analysis 
  const analyse = useCallback(async (portfolio) => {
    setLoading(true);
    setError(null);
    currentPortfolio.current = portfolio;
    try {
      const data = await analysePortfolio(portfolio);
      setResult(data);
      setLastUpdate(new Date());
      setDataUpdatedAt(null);
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }, []);

  // Live mode 
  const startLive = useCallback(async (portfolio) => {
    try {
      // Stop any existing session 
      if (sessionIdRef.current) {
        await deleteSession(sessionIdRef.current).catch(() => {});
      }
      clearInterval(pollRef.current);

      const { session_id } = await createSession(portfolio);
      setSessionId(session_id);
      setLiveMode(true);
      setError(null);
      currentPortfolio.current = portfolio;

      const poll = async (sid) => {
        try {
          const data = await getSession(sid);
          setResult(data);
          setLastUpdate(new Date());
          if (data.updated_at) setDataUpdatedAt(data.updated_at);
          setError(null);
        } catch (e) {
          if (e.response?.status === 202) return; // silent processing 
          // Surface transient errors without killing the loop
          setError('Live update error: ' + (e.response?.data?.detail || e.message || 'unknown'));
        }
      };

      // First poll 
      await poll(session_id);
      pollRef.current = setInterval(() => poll(sessionIdRef.current), POLL_INTERVAL_MS);
    } catch (e) {
      setError('Failed to start live session: ' + (e.message || ''));
    }
  }, []);

  // On-demand refresh 
  const refreshNow = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    setRefreshing(true);
    try {
      await refreshSession(sid);
      const data = await getSession(sid);
      setResult(data);
      setLastUpdate(new Date());
      if (data.updated_at) setDataUpdatedAt(data.updated_at);
      setError(null);
    } catch (e) {
      setError('Refresh failed: ' + (e.response?.data?.detail || e.message || 'unknown'));
    } finally {
      setRefreshing(false);
    }
  }, []);

  //  Stop live
  const stopLive = useCallback(async () => {
    clearInterval(pollRef.current);
    const sid = sessionIdRef.current;
    if (sid) await deleteSession(sid).catch(() => {});
    setSessionId(null);
    setLiveMode(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => clearInterval(pollRef.current), []);

  return {
    result, loading, error, liveMode, lastUpdate, dataUpdatedAt,
    health, refreshing,
    analyse, startLive, stopLive, refreshNow,
  };
}
