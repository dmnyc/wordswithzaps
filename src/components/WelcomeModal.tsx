import Modal from "./Modal";
import "./WelcomeModal.css";

interface WelcomeModalProps {
  open: boolean;
  onClose: () => void;
  onOpenWalletSettings: () => void;
}

export function WelcomeModal({
  open,
  onClose,
  onOpenWalletSettings,
}: WelcomeModalProps) {
  return (
    <Modal open={open} onClose={onClose} ariaLabel="Welcome to Words With Zaps">
      <div className="welcome-modal-content">
        <img
          src="/assets/wwz_logo_stack.svg"
          alt="Words With Zaps"
          className="welcome-logo"
        />
        <p className="welcome-text">
          Connect a Lightning wallet to send and receive zaps during gameplay.
        </p>
        <div className="welcome-actions">
          <button
            className="welcome-btn primary"
            type="button"
            onClick={() => {
              onClose();
              onOpenWalletSettings();
            }}
          >
            Connect a Wallet
          </button>
          <button
            className="welcome-btn secondary"
            type="button"
            onClick={onClose}
          >
            Maybe Later
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default WelcomeModal;
