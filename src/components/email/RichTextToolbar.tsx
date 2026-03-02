import { useCallback, useRef, useState } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Link, Unlink,
  Type, Palette, Highlighter, Indent, Outdent, Quote,
  Subscript, Superscript, RemoveFormatting, Code
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface RichTextToolbarProps {
  editorRef: React.RefObject<HTMLDivElement>;
  className?: string;
}

const fontSizes = ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '48px'];
const fontFamilies = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Tahoma'];
const textColors = [
  '#000000', '#333333', '#666666', '#999999', '#CCCCCC', '#FFFFFF',
  '#FF0000', '#FF6600', '#FFCC00', '#33CC33', '#0066FF', '#9933FF',
  '#CC0000', '#CC6600', '#999900', '#009933', '#003399', '#660099',
  '#FF6666', '#FFAA66', '#FFFF66', '#66FF66', '#66AAFF', '#CC66FF',
];

function execCmd(command: string, value?: string) {
  document.execCommand(command, false, value);
}

function ToolbarButton({ icon: Icon, label, command, value, active, onClick }: {
  icon: any; label: string; command?: string; value?: string; active?: boolean; onClick?: () => void;
}) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onClick) { onClick(); return; }
    if (command) execCmd(command, value);
  };

  return (
    <button
      onMouseDown={handleClick}
      title={label}
      className={cn(
        "p-1.5 rounded-md transition-colors shrink-0",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-border shrink-0 mx-0.5" />;
}

export function RichTextToolbar({ editorRef, className }: RichTextToolbarProps) {
  const [linkUrl, setLinkUrl] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);

  const insertLink = () => {
    if (linkUrl) {
      execCmd('createLink', linkUrl);
      setLinkUrl('');
      setLinkOpen(false);
    }
  };

  const removeLink = () => {
    execCmd('unlink');
  };

  return (
    <div className={cn(
      "flex items-center gap-0.5 px-2 py-1.5 bg-card border border-border rounded-lg shadow-sm flex-wrap",
      className
    )}>
      {/* Font Family */}
      <select
        className="h-7 px-1.5 text-xs rounded-md border border-border bg-card text-foreground outline-none cursor-pointer"
        onChange={(e) => execCmd('fontName', e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        defaultValue="Arial"
      >
        {fontFamilies.map(f => (
          <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
        ))}
      </select>

      {/* Font Size */}
      <select
        className="h-7 px-1.5 text-xs rounded-md border border-border bg-card text-foreground outline-none cursor-pointer w-16"
        onChange={(e) => {
          // execCommand fontSize only supports 1-7, so we use CSS instead
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            execCmd('fontSize', '7');
            // find the font element and replace size with actual CSS
            const fonts = editorRef.current?.querySelectorAll('font[size="7"]');
            fonts?.forEach(el => {
              (el as HTMLElement).removeAttribute('size');
              (el as HTMLElement).style.fontSize = e.target.value;
            });
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
        defaultValue="14px"
      >
        {fontSizes.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <ToolbarDivider />

      {/* Text Formatting */}
      <ToolbarButton icon={Bold} label="Bold (Ctrl+B)" command="bold" />
      <ToolbarButton icon={Italic} label="Italic (Ctrl+I)" command="italic" />
      <ToolbarButton icon={Underline} label="Underline (Ctrl+U)" command="underline" />
      <ToolbarButton icon={Strikethrough} label="Strikethrough" command="strikeThrough" />
      <ToolbarButton icon={Subscript} label="Subscript" command="subscript" />
      <ToolbarButton icon={Superscript} label="Superscript" command="superscript" />

      <ToolbarDivider />

      {/* Text Color */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            onMouseDown={(e) => e.preventDefault()}
            title="Text Color"
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Palette className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2" align="start">
          <p className="text-xs font-medium text-foreground mb-2">Text Color</p>
          <div className="grid grid-cols-6 gap-1">
            {textColors.map(c => (
              <button
                key={c}
                onMouseDown={(e) => { e.preventDefault(); execCmd('foreColor', c); }}
                className="w-6 h-6 rounded-md border border-border hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Highlight */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            onMouseDown={(e) => e.preventDefault()}
            title="Highlight Color"
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Highlighter className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2" align="start">
          <p className="text-xs font-medium text-foreground mb-2">Highlight</p>
          <div className="grid grid-cols-6 gap-1">
            {['transparent', '#FFFF00', '#00FF00', '#00FFFF', '#FF69B4', '#FFA500', '#FF0000', '#9370DB', '#87CEEB', '#98FB98', '#FFB6C1', '#FFDAB9'].map(c => (
              <button
                key={c}
                onMouseDown={(e) => { e.preventDefault(); execCmd('hiliteColor', c); }}
                className="w-6 h-6 rounded-md border border-border hover:scale-110 transition-transform"
                style={{ backgroundColor: c === 'transparent' ? '#fff' : c }}
                title={c === 'transparent' ? 'None' : c}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarButton icon={List} label="Bullet List" command="insertUnorderedList" />
      <ToolbarButton icon={ListOrdered} label="Numbered List" command="insertOrderedList" />
      <ToolbarButton icon={Indent} label="Increase Indent" command="indent" />
      <ToolbarButton icon={Outdent} label="Decrease Indent" command="outdent" />

      <ToolbarDivider />

      {/* Alignment */}
      <ToolbarButton icon={AlignLeft} label="Align Left" command="justifyLeft" />
      <ToolbarButton icon={AlignCenter} label="Align Center" command="justifyCenter" />
      <ToolbarButton icon={AlignRight} label="Align Right" command="justifyRight" />
      <ToolbarButton icon={AlignJustify} label="Justify" command="justifyFull" />

      <ToolbarDivider />

      {/* Link */}
      <Popover open={linkOpen} onOpenChange={setLinkOpen}>
        <PopoverTrigger asChild>
          <button
            onMouseDown={(e) => e.preventDefault()}
            title="Insert Link"
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Link className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <p className="text-xs font-medium text-foreground mb-2">Insert Link</p>
          <Input
            placeholder="https://example.com"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            className="text-sm mb-2"
            onKeyDown={(e) => { if (e.key === 'Enter') insertLink(); }}
          />
          <Button size="sm" onClick={insertLink} className="w-full">Insert</Button>
        </PopoverContent>
      </Popover>
      <ToolbarButton icon={Unlink} label="Remove Link" onClick={removeLink} />

      <ToolbarDivider />

      {/* Misc */}
      <ToolbarButton icon={Quote} label="Blockquote" command="formatBlock" value="blockquote" />
      <ToolbarButton icon={Code} label="Code" command="formatBlock" value="pre" />
      <ToolbarButton icon={RemoveFormatting} label="Clear Formatting" command="removeFormat" />
    </div>
  );
}
