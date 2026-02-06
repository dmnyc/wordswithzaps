import { useState, useRef, useEffect, useCallback } from "react";
import { searchProfiles } from "../nostr/profiles";
import { nip19 } from "nostr-tools";
import type { NostrProfile } from "../types/nostr";

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Text input with @-mention autocomplete.
 *
 * Typing @ followed by text triggers a profile search dropdown.
 * Selecting a user inserts `nostr:npub1...` into the text which
 * is rendered as a pill on display.
 */
export default function MentionInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
}: MentionInputProps) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<NostrProfile[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Detect @mention trigger
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      onChange(text);

      const cursorPos = e.target.selectionStart;
      const textBefore = text.slice(0, cursorPos);

      // Find the last @ that isn't preceded by a non-space char
      const atMatch = textBefore.match(/(^|[\s])@(\w*)$/);
      if (atMatch) {
        setMentionQuery(atMatch[2]);
        setSelectedIndex(0);
      } else {
        setMentionQuery(null);
        setMentionResults([]);
      }
    },
    [onChange],
  );

  // Search profiles when mention query changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (mentionQuery === null || mentionQuery.length < 1) {
      setMentionResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchProfiles(mentionQuery, 6);
        setMentionResults(results);
      } catch {
        setMentionResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [mentionQuery]);

  const insertMention = useCallback(
    (profile: NostrProfile) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursorPos = textarea.selectionStart;
      const textBefore = value.slice(0, cursorPos);
      const textAfter = value.slice(cursorPos);

      // Find the @query portion to replace
      const atMatch = textBefore.match(/(^|[\s])@(\w*)$/);
      if (!atMatch) return;

      const replaceStart = textBefore.length - atMatch[2].length - 1; // -1 for @
      const npub = nip19.npubEncode(profile.pubkey);
      const mention = `nostr:${npub}`;

      const newText = value.slice(0, replaceStart) + mention + " " + textAfter;
      onChange(newText);
      setMentionQuery(null);
      setMentionResults([]);

      // Restore cursor position after the inserted mention
      setTimeout(() => {
        const newPos = replaceStart + mention.length + 1;
        textarea.setSelectionRange(newPos, newPos);
        textarea.focus();
      }, 0);
    },
    [value, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionResults.length > 0 && mentionQuery !== null) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < mentionResults.length - 1 ? prev + 1 : 0,
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : mentionResults.length - 1,
          );
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          insertMention(mentionResults[selectedIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMentionQuery(null);
          setMentionResults([]);
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [mentionResults, mentionQuery, selectedIndex, insertMention, onSubmit],
  );

  return (
    <div className="mention-input-wrap">
      <textarea
        ref={textareaRef}
        className="dm-compose-input"
        placeholder={placeholder || "Type a message..."}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={3}
      />

      {mentionQuery !== null && (mentionResults.length > 0 || searching) && (
        <div className="mention-dropdown" ref={dropdownRef}>
          {searching && mentionResults.length === 0 && (
            <div className="mention-dropdown-status">Searching...</div>
          )}
          {mentionResults.map((profile, i) => {
            const name =
              profile.displayName ||
              profile.name ||
              profile.pubkey.slice(0, 12) + "...";
            return (
              <button
                key={profile.pubkey}
                className={`mention-dropdown-item ${i === selectedIndex ? "selected" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent textarea blur
                  insertMention(profile);
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                {profile.picture ? (
                  <img
                    src={profile.picture}
                    alt=""
                    className="mention-dropdown-avatar"
                  />
                ) : (
                  <div className="mention-dropdown-avatar-fallback">
                    {name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="mention-dropdown-info">
                  <span className="mention-dropdown-name">{name}</span>
                  {profile.nip05 && (
                    <span className="mention-dropdown-nip05">
                      {profile.nip05}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
