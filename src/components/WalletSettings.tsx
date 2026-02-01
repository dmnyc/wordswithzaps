import { useState } from "react";
import { useWallet } from "../hooks/useWallet";
import { WalletKind } from "../types/wallet";
import { backupNwcToNostr, restoreNwcFromNostr } from "../wallet/nwcBackup";
import {
  backupSparkToNostr,
  restoreSparkFromNostr,
} from "../wallet/spark/backup";
import { getCurrentUser } from "../nostr/client";
import "./WalletSettings.css";

interface WalletSettingsProps {
  onClose: () => void;
}

export function WalletSettings({ onClose }: WalletSettingsProps) {
  const {
    wallets,
    activeWallet,
    connectNWC,
    createSparkWallet,
    importSparkWallet,
    hasSparkWallet,
    bitcoinConnectEnabled,
    toggleBitcoinConnect,
    disconnect,
    setActiveWallet,
    state,
  } = useWallet();

  const [view, setView] = useState<
    "main" | "add-nwc" | "add-spark" | "import-spark" | "backup"
  >("main");
  const [nwcUrl, setNwcUrl] = useState("");
  const [sparkMnemonic, setSparkMnemonic] = useState("");
  const [newMnemonic, setNewMnemonic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const hasEmbeddedWallet = wallets.some(
    (wallet) =>
      wallet.kind === WalletKind.SPARK || wallet.kind === WalletKind.NWC,
  );
  const hasNwcWallet = wallets.some((wallet) => wallet.kind === WalletKind.NWC);
  const showAddWalletSection = !hasSparkWallet || !hasNwcWallet;

  const handleConnectNWC = async () => {
    try {
      setLoading(true);
      setError(null);
      await connectNWC(nwcUrl.trim());
      setNwcUrl("");
      setView("main");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect NWC");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSpark = async () => {
    try {
      setLoading(true);
      setError(null);
      const mnemonic = await createSparkWallet();
      setNewMnemonic(mnemonic);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create wallet");
    } finally {
      setLoading(false);
    }
  };

  const handleImportSpark = async () => {
    try {
      setLoading(true);
      setError(null);
      await importSparkWallet(sparkMnemonic.trim());
      setSparkMnemonic("");
      setView("main");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import wallet");
    } finally {
      setLoading(false);
    }
  };

  const handleBackupNwc = async () => {
    const currentUser = getCurrentUser();
    if (!currentUser?.pubkey) {
      setError("Must be logged in to backup");
      return;
    }

    const nwcWallet = wallets.find((w) => w.kind === WalletKind.NWC);
    if (!nwcWallet?.data?.connectionUrl) {
      setError("No NWC wallet to backup");
      return;
    }

    try {
      setLoading(true);
      await backupNwcToNostr(currentUser.pubkey, nwcWallet.data.connectionUrl);
      setBackupStatus("NWC backup saved to Nostr");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreNwc = async () => {
    const currentUser = getCurrentUser();
    if (!currentUser?.pubkey) {
      setError("Must be logged in to restore");
      return;
    }

    try {
      setLoading(true);
      const connectionUrl = await restoreNwcFromNostr(currentUser.pubkey);
      if (connectionUrl) {
        await connectNWC(connectionUrl);
        setBackupStatus("NWC wallet restored from Nostr");
        setView("main");
      } else {
        setError("No NWC backup found on Nostr");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBackupSpark = async () => {
    const currentUser = getCurrentUser();
    if (!currentUser?.pubkey) {
      setError("Must be logged in to backup");
      return;
    }

    try {
      setLoading(true);
      await backupSparkToNostr(currentUser.pubkey);
      setBackupStatus("Spark backup saved to Nostr");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreSpark = async () => {
    const currentUser = getCurrentUser();
    if (!currentUser?.pubkey) {
      setError("Must be logged in to restore");
      return;
    }

    try {
      setLoading(true);
      const mnemonic = await restoreSparkFromNostr(currentUser.pubkey);
      if (mnemonic) {
        await importSparkWallet(mnemonic);
        setBackupStatus("Spark wallet restored from Nostr");
        setView("main");
      } else {
        setError("No Spark backup found on Nostr");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setLoading(false);
    }
  };

  const handleMnemonicConfirmed = () => {
    setNewMnemonic(null);
    setView("main");
  };

  // Show mnemonic backup screen after creating new wallet
  if (newMnemonic) {
    return (
      <div className="wallet-settings-overlay">
        <div className="wallet-settings-modal">
          <h2>Save Your Recovery Phrase</h2>
          <p className="wallet-settings-warning">
            Write down these 12 words and store them safely. They are the only
            way to recover your wallet.
          </p>
          <div className="mnemonic-display">
            {newMnemonic.split(" ").map((word, i) => (
              <div key={i} className="mnemonic-word">
                <span className="mnemonic-num">{i + 1}.</span> {word}
              </div>
            ))}
          </div>
          <button
            className="wallet-btn primary"
            onClick={handleMnemonicConfirmed}
          >
            I've saved my recovery phrase
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-settings-overlay">
      <div className="wallet-settings-modal">
        <button className="wallet-settings-close" onClick={onClose}>
          &times;
        </button>

        {view === "main" && (
          <>
            <h2>Wallet Settings</h2>

            {error && <div className="wallet-error">{error}</div>}
            {backupStatus && (
              <div className="wallet-success">{backupStatus}</div>
            )}

            {/* Connected Wallets */}
            <div className="wallet-section">
              <h3>Connected Wallets</h3>
              {wallets.length === 0 ? (
                <p className="wallet-empty">No wallets connected</p>
              ) : (
                <div className="wallet-list">
                  {wallets.map((wallet) => (
                    <div
                      key={wallet.id}
                      className={`wallet-item ${wallet.active ? "active" : ""}`}
                    >
                      <div className="wallet-item-info">
                        <span className="wallet-item-name">{wallet.name}</span>
                        <span className="wallet-item-type">
                          {wallet.kind === WalletKind.SPARK
                            ? "Self-custodial"
                            : "NWC"}
                        </span>
                      </div>
                      <div className="wallet-item-actions">
                        {!wallet.active && (
                          <button
                            className="wallet-btn-small"
                            onClick={() => setActiveWallet(wallet.id)}
                          >
                            Use
                          </button>
                        )}
                        <button
                          className="wallet-btn-small danger"
                          onClick={() => disconnect(wallet.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Balance */}
            {activeWallet && state.balance !== undefined && (
              <div className="wallet-balance">
                <span className="balance-label">Balance:</span>
                <span className="balance-amount">
                  {state.balance.toLocaleString()} sats
                </span>
              </div>
            )}

            {/* Add Wallet */}
            {showAddWalletSection && (
              <div className="wallet-section">
                <h3>Add Wallet</h3>
                <div className="wallet-add-options">
                  {!hasSparkWallet && (
                    <button
                      className="wallet-btn"
                      onClick={() => setView("add-spark")}
                    >
                      Create Self-Custodial Wallet
                    </button>
                  )}
                  {!hasNwcWallet && (
                    <button
                      className="wallet-btn"
                      onClick={() => setView("add-nwc")}
                    >
                      Connect NWC Wallet
                    </button>
                  )}
                  {!hasSparkWallet && (
                    <button
                      className="wallet-btn secondary"
                      onClick={() => setView("import-spark")}
                    >
                      Import with Recovery Phrase
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Bitcoin Connect */}
            {!hasEmbeddedWallet && (
              <div className="wallet-section">
                <h3>External Wallet</h3>
                <label className="wallet-toggle">
                  <input
                    type="checkbox"
                    checked={bitcoinConnectEnabled}
                    onChange={toggleBitcoinConnect}
                  />
                  <span>Enable Bitcoin Connect</span>
                </label>
                <p className="wallet-hint">
                  Use as fallback when no embedded wallet is active
                </p>
              </div>
            )}

            {/* Backup */}
            <div className="wallet-section">
              <h3>Backup & Restore</h3>
              <div className="wallet-add-options">
                <button
                  className="wallet-btn secondary"
                  onClick={() => setView("backup")}
                >
                  Manage Backups
                </button>
              </div>
            </div>
          </>
        )}

        {view === "add-nwc" && (
          <>
            <h2>Connect NWC Wallet</h2>
            {error && <div className="wallet-error">{error}</div>}
            <p className="wallet-hint">
              Paste your NWC connection string from Alby, Mutiny, or another NWC
              provider.
            </p>
            <textarea
              className="wallet-input"
              placeholder="nostr+walletconnect://..."
              value={nwcUrl}
              onChange={(e) => setNwcUrl(e.target.value)}
              rows={3}
            />
            <div className="wallet-actions">
              <button
                className="wallet-btn secondary"
                onClick={() => {
                  setView("main");
                  setError(null);
                }}
              >
                Cancel
              </button>
              <button
                className="wallet-btn primary"
                onClick={handleConnectNWC}
                disabled={!nwcUrl.trim() || loading}
              >
                {loading ? "Connecting..." : "Connect"}
              </button>
            </div>
          </>
        )}

        {view === "add-spark" && (
          <>
            <h2>Create Self-Custodial Wallet</h2>
            {error && <div className="wallet-error">{error}</div>}
            <p className="wallet-hint">
              Create a new Lightning wallet powered by Breez SDK. Your funds are
              controlled by you.
            </p>
            <div className="wallet-actions">
              <button
                className="wallet-btn secondary"
                onClick={() => {
                  setView("main");
                  setError(null);
                }}
              >
                Cancel
              </button>
              <button
                className="wallet-btn primary"
                onClick={handleCreateSpark}
                disabled={loading}
              >
                {loading ? "Creating..." : "Create Wallet"}
              </button>
            </div>
          </>
        )}

        {view === "import-spark" && (
          <>
            <h2>Import Wallet</h2>
            {error && <div className="wallet-error">{error}</div>}
            <p className="wallet-hint">
              Enter your 12-word recovery phrase to restore your wallet.
            </p>
            <textarea
              className="wallet-input"
              placeholder="word1 word2 word3 ..."
              value={sparkMnemonic}
              onChange={(e) => setSparkMnemonic(e.target.value)}
              rows={3}
            />
            <div className="wallet-actions">
              <button
                className="wallet-btn secondary"
                onClick={() => {
                  setView("main");
                  setError(null);
                  setSparkMnemonic("");
                }}
              >
                Cancel
              </button>
              <button
                className="wallet-btn primary"
                onClick={handleImportSpark}
                disabled={!sparkMnemonic.trim() || loading}
              >
                {loading ? "Importing..." : "Import Wallet"}
              </button>
            </div>
          </>
        )}

        {view === "backup" && (
          <>
            <h2>Backup & Restore</h2>
            {error && <div className="wallet-error">{error}</div>}
            {backupStatus && (
              <div className="wallet-success">{backupStatus}</div>
            )}

            <div className="wallet-section">
              <h3>NWC Wallet</h3>
              <div className="wallet-add-options">
                <button
                  className="wallet-btn secondary"
                  onClick={handleBackupNwc}
                  disabled={
                    loading || !wallets.some((w) => w.kind === WalletKind.NWC)
                  }
                >
                  Backup to Nostr
                </button>
                <button
                  className="wallet-btn secondary"
                  onClick={handleRestoreNwc}
                  disabled={loading}
                >
                  Restore from Nostr
                </button>
              </div>
            </div>

            <div className="wallet-section">
              <h3>Self-Custodial Wallet</h3>
              <div className="wallet-add-options">
                <button
                  className="wallet-btn secondary"
                  onClick={handleBackupSpark}
                  disabled={loading || !hasSparkWallet}
                >
                  Backup to Nostr
                </button>
                <button
                  className="wallet-btn secondary"
                  onClick={handleRestoreSpark}
                  disabled={loading}
                >
                  Restore from Nostr
                </button>
              </div>
              <p className="wallet-hint">
                Backups are encrypted with your Nostr key
              </p>
            </div>

            <div className="wallet-actions">
              <button
                className="wallet-btn"
                onClick={() => {
                  setView("main");
                  setError(null);
                  setBackupStatus(null);
                }}
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default WalletSettings;
