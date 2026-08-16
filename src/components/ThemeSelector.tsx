import React, { useState } from 'react';
import { MARKDOWN_THEMES, MarkdownTheme, getThemeById } from '../lib/markdownThemes';
import { Palette, Check, Sparkles, SlidersHorizontal, Sun, Moon, BookOpen } from 'lucide-react';

interface ThemeSelectorProps {
  currentThemeId: string;
  onSelectTheme: (themeId: string) => void;
  compact?: boolean;
}

export default function ThemeSelector({
  currentThemeId,
  onSelectTheme,
  compact = false,
}: ThemeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const activeTheme = getThemeById(currentThemeId);

  if (compact) {
    return (
      <div className="relative inline-block text-left">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition cursor-pointer shadow-2xs"
          title="Select Markdown CSS Theme"
        >
          <Palette className="w-3.5 h-3.5 text-indigo-600" />
          <span className="truncate max-w-[110px]">{activeTheme.name}</span>
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10"
            style={{ backgroundColor: activeTheme.bg }}
          />
        </button>

        {isOpen && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
        )}

        {isOpen && (
          <div className="absolute right-0 mt-1 w-64 rounded-xl bg-white border border-slate-200 shadow-xl z-50 p-2 flex flex-col gap-1 text-xs animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="px-2 py-1.5 font-bold text-slate-400 text-[10px] uppercase tracking-wider flex items-center justify-between border-b border-slate-100 mb-1">
              <span>Markdown CSS Themes</span>
              <Sparkles className="w-3 h-3 text-amber-500" />
            </div>

            <div className="max-h-72 overflow-y-auto flex flex-col gap-1 pr-0.5">
              {MARKDOWN_THEMES.map((theme) => {
                const isSelected = theme.id === currentThemeId;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => {
                      onSelectTheme(theme.id);
                      setIsOpen(false);
                    }}
                    className={`flex items-center justify-between p-2 rounded-lg text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white font-medium'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 border border-slate-300 shadow-2xs"
                        style={{ backgroundColor: theme.bg }}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="truncate font-medium text-xs">{theme.name}</span>
                        <span
                          className={`text-[10px] truncate ${
                            isSelected ? 'text-slate-300' : 'text-slate-400'
                          }`}
                        >
                          {theme.mode} mode
                        </span>
                      </div>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-indigo-600" />
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Markdown CSS Theme Gallery
          </h4>
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          {MARKDOWN_THEMES.length} Themes Available
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {MARKDOWN_THEMES.map((theme) => {
          const isSelected = theme.id === currentThemeId;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => onSelectTheme(theme.id)}
              className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-2.5 ${
                isSelected
                  ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/20 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/60'
              }`}
            >
              {/* Mini Preview Box */}
              <div
                className="w-full h-12 rounded-lg p-2 border border-slate-200/80 flex flex-col justify-center gap-1 overflow-hidden shadow-2xs"
                style={{ backgroundColor: theme.bg, color: theme.fg }}
              >
                <div
                  className="text-[11px] font-bold truncate leading-none"
                  style={{ color: theme.accent, fontFamily: theme.fontFamily }}
                >
                  {theme.name}
                </div>
                <div
                  className="text-[9px] opacity-75 truncate leading-none"
                  style={{ fontFamily: theme.fontFamily }}
                >
                  The quick brown fox jumps over...
                </div>
              </div>

              {/* Theme Details */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-slate-800 truncate">
                    {theme.name}
                  </span>
                  <span className="text-[10px] text-slate-400 capitalize">
                    {theme.mode} mode
                  </span>
                </div>
                {isSelected && (
                  <span className="p-1 rounded-full bg-indigo-600 text-white shrink-0">
                    <Check className="w-3 h-3" />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
