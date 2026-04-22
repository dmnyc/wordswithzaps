import { useCallback, useState } from "react";
import Modal from "./Modal";
import "./AboutModal.css";

const CREATOR_NPUB =
  "npub1aeh2zw4elewy5682lxc6xnlqzjnxksq303gwu2npfaxd49vmde6qcq4nwx";
const GITHUB_ISSUES_URL = "https://github.com/dmnyc/wordswithzaps/issues";
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "1.1.2";
const BREEZ_SDK_VERSION = "0.11.0";
const COMMIT_HASH =
  import.meta.env.VITE_COMMIT_SHA || import.meta.env.VITE_GIT_SHA || "dev";
const SHORT_COMMIT = COMMIT_HASH === "dev" ? "dev" : COMMIT_HASH.slice(0, 7);

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
  onZapCreator: () => void;
}

export function AboutModal({ open, onClose, onZapCreator }: AboutModalProps) {
  const profileUrl = `https://zap.cooking/user/${CREATOR_NPUB}`;
  const [copied, setCopied] = useState(false);
  const versionString = `Version ${APP_VERSION} (${SHORT_COMMIT})`;

  const handleCopyVersion = useCallback(() => {
    navigator.clipboard.writeText(versionString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [versionString]);

  return (
    <Modal open={open} onClose={onClose}>
      <div className="about-modal">
        <img
          src="/assets/wwz_logo_stack.svg"
          alt="Words With Zaps"
          className="about-logo"
        />

        <p className="about-description">
          A two-player word game on Nostr with Lightning micropayments.
          Challenge friends, build words, and zap your way to victory.
        </p>

        <div className="about-creator">
          <span>Created by </span>
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="about-creator-link"
          >
            @thedaniel
          </a>
        </div>

        <div className="about-version">
          <span className="about-version-row">
            {versionString}
            <button
              type="button"
              className="about-version-copy"
              onClick={handleCopyVersion}
              aria-label="Copy version"
              title="Copy version"
            >
              {copied ? "copied" : "copy"}
            </button>
          </span>
          <br />
          Breez SDK {BREEZ_SDK_VERSION}
        </div>

        <div className="about-links">
          <a
            href={GITHUB_ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="about-link"
          >
            Report an Issue
          </a>
          <button
            className="about-link about-link-btn"
            onClick={() => {
              onClose();
              onZapCreator();
            }}
          >
            Zap the Creator
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default AboutModal;
