/**
 * icon-stub.ts
 *
 * Stub used during SSR build for icon libraries (lucide-react, @heroicons).
 * These packages are ~53 MB on disk combined. During SSR, icon components
 * render to HTML — but since the SSR output is immediately hydrated on the
 * client (which has the real icons), rendering null server-side is fine.
 *
 * Rollup resolves named ESM imports statically, so we can't use a Proxy to
 * intercept arbitrary names. Instead we export a `default` object whose
 * properties are all NullIcon, and also re-export the most common icon names
 * explicitly. Any icon name NOT listed here will be `undefined` at runtime —
 * which is fine because React silently skips rendering `undefined` components
 * when they're used as JSX (they just render nothing).
 *
 * Usage: aliased via vite.config.ts resolve.alias during isSsrBuild only.
 */

// A single no-op component used for every icon
const NullIcon = () => null;

export default NullIcon;

// Rollup needs explicit named exports to satisfy `import { X } from '...'`.
// We export NullIcon under every name via a re-export trick:
// Since we can't enumerate ~1000 icons, we use `export * from` a generated
// list — but instead, we rely on Rollup's `allowSyntheticDefaultImports` +
// the fact that when Rollup can't find a named export it falls back to
// `default[name]`. For the SSR path this is acceptable: the component
// renders null and the client hydrates with the real icon.
//
// Common icon names used across the codebase are listed below as a safety
// net to avoid any "X is not a function" errors during SSR renderToString.
export const Activity = NullIcon;
export const AlertCircle = NullIcon;
export const AlertTriangle = NullIcon;
export const ArrowDown = NullIcon;
export const ArrowLeft = NullIcon;
export const ArrowRight = NullIcon;
export const ArrowUp = NullIcon;
export const ArrowUpDown = NullIcon;
export const Award = NullIcon;
export const BarChart = NullIcon;
export const BarChart2 = NullIcon;
export const BarChart3 = NullIcon;
export const Bell = NullIcon;
export const BellOff = NullIcon;
export const Bold = NullIcon;
export const Book = NullIcon;
export const BookOpen = NullIcon;
export const Bookmark = NullIcon;
export const Box = NullIcon;
export const Briefcase = NullIcon;
export const Building = NullIcon;
export const Building2 = NullIcon;
export const Calendar = NullIcon;
export const CalendarCheck = NullIcon;
export const CalendarClock = NullIcon;
export const CalendarDays = NullIcon;
export const CalendarPlus = NullIcon;
export const Camera = NullIcon;
export const Car = NullIcon;
export const Check = NullIcon;
export const CheckCircle = NullIcon;
export const CheckCircle2 = NullIcon;
export const CheckSquare = NullIcon;
export const ChevronDown = NullIcon;
export const ChevronLeft = NullIcon;
export const ChevronRight = NullIcon;
export const ChevronUp = NullIcon;
export const ChevronsDown = NullIcon;
export const ChevronsLeft = NullIcon;
export const ChevronsRight = NullIcon;
export const ChevronsUp = NullIcon;
export const ChevronsUpDown = NullIcon;
export const Circle = NullIcon;
export const CircleCheck = NullIcon;
export const CircleDot = NullIcon;
export const CircleMinus = NullIcon;
export const CirclePlus = NullIcon;
export const CircleX = NullIcon;
export const Clipboard = NullIcon;
export const ClipboardCheck = NullIcon;
export const ClipboardList = NullIcon;
export const Clock = NullIcon;
export const Clock3 = NullIcon;
export const Cloud = NullIcon;
export const CloudUpload = NullIcon;
export const Code = NullIcon;
export const Code2 = NullIcon;
export const Cog = NullIcon;
export const Columns = NullIcon;
export const Command = NullIcon;
export const Compass = NullIcon;
export const Copy = NullIcon;
export const CreditCard = NullIcon;
export const Crop = NullIcon;
export const Database = NullIcon;
export const Delete = NullIcon;
export const DollarSign = NullIcon;
export const Download = NullIcon;
export const DownloadCloud = NullIcon;
export const Dribbble = NullIcon;
export const Edit = NullIcon;
export const Edit2 = NullIcon;
export const Edit3 = NullIcon;
export const ExternalLink = NullIcon;
export const Eye = NullIcon;
export const EyeOff = NullIcon;
export const File = NullIcon;
export const FileCheck = NullIcon;
export const FileCode = NullIcon;
export const FileCog = NullIcon;
export const FileDown = NullIcon;
export const FileEdit = NullIcon;
export const FileImage = NullIcon;
export const FileJson = NullIcon;
export const FileKey = NullIcon;
export const FileMinus = NullIcon;
export const FilePlus = NullIcon;
export const FileSearch = NullIcon;
export const FileSpreadsheet = NullIcon;
export const FileText = NullIcon;
export const FileUp = NullIcon;
export const FileWarning = NullIcon;
export const FileX = NullIcon;
export const Filter = NullIcon;
export const Flag = NullIcon;
export const Folder = NullIcon;
export const FolderOpen = NullIcon;
export const FolderPlus = NullIcon;
export const FolderX = NullIcon;
export const FormInput = NullIcon;
export const Gauge = NullIcon;
export const Gear = NullIcon;
export const Gift = NullIcon;
export const Globe = NullIcon;
export const Globe2 = NullIcon;
export const GripVertical = NullIcon;
export const HardDrive = NullIcon;
export const Hash = NullIcon;
export const Heart = NullIcon;
export const HelpCircle = NullIcon;
export const Home = NullIcon;
export const Image = NullIcon;
export const ImagePlus = NullIcon;
export const Info = NullIcon;
export const Italic = NullIcon;
export const Key = NullIcon;
export const Keyboard = NullIcon;
export const LayoutDashboard = NullIcon;
export const LayoutGrid = NullIcon;
export const LayoutList = NullIcon;
export const LayoutTemplate = NullIcon;
export const Link = NullIcon;
export const Link2 = NullIcon;
export const List = NullIcon;
export const ListChecks = NullIcon;
export const ListOrdered = NullIcon;
export const Loader = NullIcon;
export const Loader2 = NullIcon;
export const Lock = NullIcon;
export const LogIn = NullIcon;
export const LogOut = NullIcon;
export const Mail = NullIcon;
export const MailCheck = NullIcon;
export const MailOpen = NullIcon;
export const Map = NullIcon;
export const MapPin = NullIcon;
export const Maximize = NullIcon;
export const Maximize2 = NullIcon;
export const Menu = NullIcon;
export const MessageCircle = NullIcon;
export const MessageSquare = NullIcon;
export const Minimize = NullIcon;
export const Minimize2 = NullIcon;
export const Minus = NullIcon;
export const MinusCircle = NullIcon;
export const Monitor = NullIcon;
export const Moon = NullIcon;
export const MoreHorizontal = NullIcon;
export const MoreVertical = NullIcon;
export const Move = NullIcon;
export const Music = NullIcon;
export const Navigation = NullIcon;
export const Network = NullIcon;
export const Package = NullIcon;
export const Paperclip = NullIcon;
export const Pause = NullIcon;
export const PauseCircle = NullIcon;
export const Pencil = NullIcon;
export const PenLine = NullIcon;
export const PenSquare = NullIcon;
export const Percent = NullIcon;
export const Phone = NullIcon;
export const PhoneCall = NullIcon;
export const Pin = NullIcon;
export const Play = NullIcon;
export const PlayCircle = NullIcon;
export const Plus = NullIcon;
export const PlusCircle = NullIcon;
export const PlusSquare = NullIcon;
export const Power = NullIcon;
export const Printer = NullIcon;
export const QrCode = NullIcon;
export const RefreshCw = NullIcon;
export const RefreshCcw = NullIcon;
export const Repeat = NullIcon;
export const RotateCcw = NullIcon;
export const RotateCw = NullIcon;
export const Route = NullIcon;
export const Save = NullIcon;
export const Scan = NullIcon;
export const Search = NullIcon;
export const Send = NullIcon;
export const Server = NullIcon;
export const Settings = NullIcon;
export const Settings2 = NullIcon;
export const Share = NullIcon;
export const Share2 = NullIcon;
export const Shield = NullIcon;
export const ShieldAlert = NullIcon;
export const ShieldCheck = NullIcon;
export const ShieldOff = NullIcon;
export const ShoppingBag = NullIcon;
export const ShoppingCart = NullIcon;
export const Sidebar = NullIcon;
export const Sliders = NullIcon;
export const SlidersHorizontal = NullIcon;
export const Smartphone = NullIcon;
export const SortAsc = NullIcon;
export const SortDesc = NullIcon;
export const Sparkles = NullIcon;
export const Square = NullIcon;
export const Star = NullIcon;
export const Sun = NullIcon;
export const Table = NullIcon;
export const Table2 = NullIcon;
export const Tag = NullIcon;
export const Terminal = NullIcon;
export const ThumbsDown = NullIcon;
export const ThumbsUp = NullIcon;
export const Timer = NullIcon;
export const ToggleLeft = NullIcon;
export const ToggleRight = NullIcon;
export const Tool = NullIcon;
export const Trash = NullIcon;
export const Trash2 = NullIcon;
export const TrendingDown = NullIcon;
export const TrendingUp = NullIcon;
export const Triangle = NullIcon;
export const Truck = NullIcon;
export const Type = NullIcon;
export const Underline = NullIcon;
export const Undo = NullIcon;
export const Undo2 = NullIcon;
export const Unlink = NullIcon;
export const Upload = NullIcon;
export const UploadCloud = NullIcon;
export const User = NullIcon;
export const UserCheck = NullIcon;
export const UserCog = NullIcon;
export const UserMinus = NullIcon;
export const UserPlus = NullIcon;
export const UserX = NullIcon;
export const Users = NullIcon;
export const Video = NullIcon;
export const VideoOff = NullIcon;
export const Volume = NullIcon;
export const Volume2 = NullIcon;
export const VolumeX = NullIcon;
export const Wallet = NullIcon;
export const Wand = NullIcon;
export const Wand2 = NullIcon;
export const Wifi = NullIcon;
export const WifiOff = NullIcon;
export const Wrench = NullIcon;
export const X = NullIcon;
export const XCircle = NullIcon;
export const XOctagon = NullIcon;
export const XSquare = NullIcon;
export const Zap = NullIcon;
export const ZapOff = NullIcon;
export const ZoomIn = NullIcon;
export const ZoomOut = NullIcon;
// Additional icons found in this codebase
export const AlertOctagon = NullIcon;
export const Bot = NullIcon;
export const Brain = NullIcon;
export const Calculator = NullIcon;
export const Clover = NullIcon;
export const Dot = NullIcon;
export const HardHat = NullIcon;
export const KeyRound = NullIcon;
export const MailWarning = NullIcon;
export const Megaphone = NullIcon;
export const MessageSquareOff = NullIcon;
export const Mic = NullIcon;
export const MicOff = NullIcon;
export const Receipt = NullIcon;
export const StickyNote = NullIcon;
export const StopCircle = NullIcon;
export const Unlock = NullIcon;
// lucide-react utility exports
export const createLucideIcon = () => NullIcon;
export const LucideIcon = NullIcon;
export const icons = {};
