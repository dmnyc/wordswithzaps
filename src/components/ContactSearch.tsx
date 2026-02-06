import { useState, useRef, useEffect } from "react";
import { searchProfiles } from "../nostr/profiles";
import { SearchIcon } from "./icons/NotificationIcons";
import type { NostrProfile } from "../types/nostr";

interface ContactSearchProps {
  onSelect: (pubkey: string) => void;
  onClose: () => void;
}

export default function ContactSearch({ onSelect, onClose }: ContactSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NostrProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const profiles = await searchProfiles(trimmed, 15);
        setResults(profiles);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <div className="dm-contact-search">
      <div className="dm-contact-search-header">
        <div className="dm-contact-search-input-wrap">
          <SearchIcon className="dm-contact-search-icon" />
          <input
            ref={inputRef}
            className="dm-contact-search-input"
            type="text"
            placeholder="Search by name, npub, or nip05..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
          />
        </div>
        <button className="dm-contact-search-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>

      <div className="dm-contact-search-results">
        {searching && (
          <div className="dm-contact-search-status">Searching...</div>
        )}
        {!searching && query.trim() && results.length === 0 && (
          <div className="dm-contact-search-status">No users found</div>
        )}
        {results.map((profile) => {
          const displayName =
            profile.displayName || profile.name || profile.pubkey.slice(0, 12) + "...";
          return (
            <button
              key={profile.pubkey}
              className="dm-contact-search-item"
              onClick={() => onSelect(profile.pubkey)}
            >
              {profile.picture ? (
                <img
                  src={profile.picture}
                  alt=""
                  className="dm-contact-avatar"
                />
              ) : (
                <div className="dm-contact-avatar-fallback">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="dm-contact-info">
                <span className="dm-contact-name">{displayName}</span>
                {profile.nip05 && (
                  <span className="dm-contact-nip05">{profile.nip05}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
