import { useEmailBuilderStore, BlockType, EmailBlock } from '@/stores/emailBuilderStore';
import {
  Type, Image, MousePointer, Minus, ArrowUpDown, Columns, Heading, Video, Share2, Timer,
  Table, Quote, Code, FileText, Bookmark
} from 'lucide-react';
import { cn } from '@/lib/utils';

const blockTypes: { type: BlockType; label: string; icon: any; category: string }[] = [
  { type: 'heading', label: 'Heading', icon: Heading, category: 'Basic' },
  { type: 'text', label: 'Text', icon: Type, category: 'Basic' },
  { type: 'image', label: 'Image', icon: Image, category: 'Basic' },
  { type: 'button', label: 'Button', icon: MousePointer, category: 'Basic' },
  { type: 'divider', label: 'Divider', icon: Minus, category: 'Basic' },
  { type: 'spacer', label: 'Spacer', icon: ArrowUpDown, category: 'Basic' },
  { type: 'columns', label: 'Columns', icon: Columns, category: 'Layout' },
  { type: 'table', label: 'Table', icon: Table, category: 'Layout' },
  { type: 'quote', label: 'Quote', icon: Quote, category: 'Content' },
  { type: 'code', label: 'Code', icon: Code, category: 'Content' },
  { type: 'signature', label: 'Signature', icon: FileText, category: 'Content' },
  { type: 'video', label: 'Video', icon: Video, category: 'Media' },
  { type: 'social', label: 'Social', icon: Share2, category: 'Media' },
  { type: 'countdown', label: 'Countdown', icon: Timer, category: 'Advanced' },
  { type: 'bookmark', label: 'Bookmark', icon: Bookmark, category: 'Advanced' },
];

const defaultContent: Record<BlockType, Record<string, any>> = {
  heading: { text: 'Your Heading', html: '<b>Your Heading</b>', level: 'h2' },
  text: { text: 'Write your content here...', html: 'Write your content here...' },
  image: { src: '', alt: 'Image', width: '100%' },
  button: { text: 'Click Here', url: '#', align: 'center', bgColor: '#2a9d6e', textColor: '#ffffff', borderRadius: '8px', buttonPadding: '10px 24px' },
  divider: { color: '#e5e5e5', thickness: 1, style: 'solid' },
  spacer: { height: 24 },
  columns: { count: 2, content: [{ text: 'Column 1' }, { text: 'Column 2' }] },
  table: { rows: 3, cols: 3, data: [['Header 1', 'Header 2', 'Header 3'], ['Cell 1', 'Cell 2', 'Cell 3'], ['Cell 4', 'Cell 5', 'Cell 6']] },
  quote: { text: '"Your quote goes here..."', html: '<em>"Your quote goes here..."</em>', author: 'Author Name' },
  code: { text: 'const greeting = "Hello!";', html: '<code>const greeting = "Hello!";</code>', language: 'javascript' },
  signature: { text: 'Best regards,\nYour Name\nTitle | Company', html: 'Best regards,<br><b>Your Name</b><br>Title | Company' },
  video: { url: '', thumbnail: '' },
  social: { links: [{ platform: 'twitter', url: '' }, { platform: 'linkedin', url: '' }, { platform: 'facebook', url: '' }, { platform: 'instagram', url: '' }] },
  countdown: { targetDate: '', label: 'Offer ends in' },
  bookmark: { title: 'Bookmarked Link', url: '#', description: 'A short description of the link' },
};

const categories = [...new Set(blockTypes.map(b => b.category))];

export function EmailBlocksPanel() {
  const { addBlock } = useEmailBuilderStore();

  const handleAdd = (type: BlockType) => {
    const block: EmailBlock = {
      id: crypto.randomUUID(),
      type,
      content: { ...defaultContent[type] },
      styles: { padding: '16px', backgroundColor: 'transparent' },
    };
    addBlock(block);
  };

  return (
    <div className="h-full w-full border-r border-border bg-card overflow-y-auto scrollbar-thin">
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Blocks</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Click to add to canvas</p>
      </div>
      {categories.map(cat => (
        <div key={cat}>
          <div className="px-4 pt-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{cat}</span>
          </div>
          <div className="px-3 pb-2 grid grid-cols-2 gap-1.5">
            {blockTypes.filter(b => b.category === cat).map((b) => (
              <button
                key={b.type}
                onClick={() => handleAdd(b.type)}
                className={cn(
                  "flex flex-col items-center gap-1 p-2.5 rounded-lg border border-border",
                  "hover:bg-block-hover hover:border-block-border transition-all text-center",
                  "text-muted-foreground hover:text-foreground"
                )}
              >
                <b.icon className="w-4 h-4" />
                <span className="text-[10px] font-medium leading-tight">{b.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
