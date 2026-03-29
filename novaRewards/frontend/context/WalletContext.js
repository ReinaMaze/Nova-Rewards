'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { connectWallet, isFreighterInstalled } from '../lib/freighter';
import { getNOVABalance, getTransactionHistory } from '../lib/horizonClient';

const WalletContext = createContext(null);

/**
 * Provides wallet state and actions to the entire app.
 * Requirements: 8.2, 8.3
 */
export function WalletProvider({ children }) {
  const [publicKey, setPublicKey] = useState(null);
  const [balance, setBalance] = useState('0');
  const [transactions, setTransactions] = useState([]);
  const [freighterInstalled, setFreighterInstalled] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /** Fetches and updates the current NOVA balance and transaction history. */
  const refreshBalance = useCallback(async (wallet) => {
    const key = wallet || publicKey;
    if (!key) return;
    const [bal, txs] = await Promise.all([
      getNOVABalance(key),
      getTransactionHistory(key),
    ]);
    setBalance(bal);
    setTransactions(txs);
  }, [publicKey]);

  /** Connects Freighter wallet and loads initial balance. */
  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const installed = await isFreighterInstalled();
      setFreighterInstalled(installed);

      if (!installed) {
        setError('Freighter wallet extension is not installed.');
        return;
      }

      const key = await connectWallet();
      setPublicKey(key);
      await refreshBalance(key);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [refreshBalance]);

  /** Disconnects the wallet and clears all state. */
  const disconnect = useCallback(() => {
    setPublicKey(null);
    setBalance('0');
    setTransactions([]);
    setError(null);
  }, []);

  /** Poll wallet availability and handle visibility changes */
  useEffect(() => {
    if (!publicKey) return;

    let intervalId = null;

    const checkWalletAvailability = async () => {
      const installed = await isFreighterInstalled();
      if (!installed) {
        disconnect();
      }
    };

    const startPolling = () => {
      // Check immediately on start
      checkWalletAvailability();
      // Then poll every 3 seconds
      intervalId = setInterval(checkWalletAvailability, 3000);
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopPolling();
      } else {
        // Tab became visible - check state once and resume polling
        checkWalletAvailability();
        startPolling();
      }
    };

    // Start polling if tab is visible
    if (document.visibilityState === 'visible') {
      startPolling();
    }

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [publicKey, disconnect]);

  return (
    <WalletContext.Provider
      value={{
        publicKey,
        balance,
        transactions,
        freighterInstalled,
        loading,
        error,
        connect,
        disconnect,
        refreshBalance,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

/** Hook to consume wallet context. */
export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider');
  return ctx;
}
