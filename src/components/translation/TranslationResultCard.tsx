"use client";

import { Copy, Heart, HeartOff, Share2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

type TranslationResultCardProps = {
  title: string;
  value: string;
  loading: boolean;
  isFavorite: boolean;
  onCopy: () => void;
  onShare: () => void;
  onFavorite: () => void;
  onListen: () => void;
};

export function TranslationResultCard({
  title,
  value,
  loading,
  isFavorite,
  onCopy,
  onShare,
  onFavorite,
  onListen,
}: TranslationResultCardProps) {
  return (
    <section className="panel translation-result-panel fade-in" aria-live="polite">
      <header className="panel-head">
        <h3>{title}</h3>
        <div className="inline-actions">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            leftIcon={<Copy size={15} />}
            onClick={onCopy}
            disabled={loading || !value.trim()}
            aria-label="Copy translation"
          >
            Copy
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            leftIcon={<Share2 size={15} />}
            onClick={onShare}
            disabled={loading || !value.trim()}
            aria-label="Share translation"
          >
            Share
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            leftIcon={isFavorite ? <HeartOff size={15} /> : <Heart size={15} />}
            onClick={onFavorite}
            disabled={loading || !value.trim()}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            {isFavorite ? "Unsave" : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            leftIcon={<Volume2 size={15} />}
            onClick={onListen}
            disabled={loading || !value.trim()}
            aria-label="Listen translation"
          >
            Listen
          </Button>
        </div>
      </header>

      <div className="translation-output" role="region" aria-label="Translation result">
        {loading ? "Translating..." : value || "Waiting for translation..."}
      </div>
    </section>
  );
}
