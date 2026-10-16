import type { ComponentType, SVGProps } from "react";
import {
  BookOpenIcon,
  BotIcon,
  CalenderIcon,
  FileTextIcon,
  FolderIcon,
  GlobeIcon,
  GroupIcon,
  InfoIcon,
  ListIcon,
  MessageSquareIcon,
  MicIcon,
  PaperclipIcon,
  PieChartIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  TargetIcon,
  TimerIcon,
  UserCircleIcon,
  BookCheckIcon,
} from "@/icons";
import type { ComposerIcon as IconName } from "@/lib/aven/composer-registry";
import type { MentionType } from "@/lib/aven/commands";
type Icon = ComponentType<SVGProps<SVGSVGElement>>;
const icons: Record<IconName | "user", Icon> = {
  book: BookOpenIcon,
  search: SearchIcon,
  calendar: CalenderIcon,
  target: TargetIcon,
  chart: PieChartIcon,
  fileText: FileTextIcon,
  bot: BotIcon,
  mic: MicIcon,
  message: MessageSquareIcon,
  sparkles: SparklesIcon,
  timer: TimerIcon,
  list: ListIcon,
  group: GroupIcon,
  folder: FolderIcon,
  paperclip: PaperclipIcon,
  library: BookCheckIcon,
  globe: GlobeIcon,
  plus: PlusIcon,
  help: InfoIcon,
  user: UserCircleIcon,
};
/** One icon per mention type so results are recognizable at a glance. */
export const mentionIcon: Record<MentionType, IconName | "user"> = {
  subject: "folder",
  topic: "book",
  goal: "target",
  milestone: "target",
  task: "list",
  session: "calendar",
  resource: "fileText",
  friend: "user",
  circle: "group",
};
export default function ComposerIcon({ name }: { name: IconName | "user" }) {
  const Svg = icons[name];
  return <Svg aria-hidden="true" className="aven-menu-icon" />;
}
