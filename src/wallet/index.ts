// Wallet Manager - main entry point
export * from "./walletManager";

// Wallet Store
export * from "./walletStore";

// Spark
export {
  initializeSdk as initializeSparkSdk,
  createAndConnectWallet as createSparkWallet,
  connectWallet as connectSparkWallet,
  disconnectWallet as disconnectSparkWallet,
  isSparkInitialized,
  getSparkBalance,
  sendSparkPayment,
  createSparkInvoice,
  getSparkLightningAddress,
  hasSparkMnemonic,
  getSparkState,
  subscribeToSparkState,
} from "./spark";

// Spark Backup
export {
  backupSparkToNostr,
  restoreSparkFromNostr,
  hasSparkBackupOnNostr,
  deleteSparkBackupFromNostr,
} from "./spark/backup";

// Bitcoin Connect
export {
  isBitcoinConnectEnabled,
  enableBitcoinConnect,
  disableBitcoinConnect,
  payWithBitcoinConnect,
  initBitcoinConnect,
  getBitcoinConnectState,
  subscribeToBitcoinConnectState,
} from "./bitcoinConnect";
