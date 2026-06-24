// Editor UI icons, sourced from **Lucide** (`lucide-static`, ISC-licensed).
//
// `lucide-static` publishes each icon as a raw inline-SVG **string** (PascalCase
// export), which drops straight into our string-based icon pipeline: these flow
// through Milkdown `$ctx` config slices / `renderButton` returners as strings and
// are rendered by the shared `<Icon>` (sanitized `dangerouslySetInnerHTML`). So
// the switch to Lucide is a pure source swap — no architecture change.
//
// Lucide icons are **stroke-based** (`fill="none" stroke="currentColor"`), unlike
// Crepe's old fill-based SVGs, so the theme CSS colors them via `color:`
// (currentColor → stroke), and any `fill:` on an icon `svg` would wrongly paint
// the whole glyph — see the theme CSS migration.
//
// Naming maps our existing `*Icon` names (kept stable for every call site) to the
// closest Lucide icon. Notable design choices: the block-handle "::" drag grip →
// `GripVertical`; the table row/col handle → `GripHorizontal`; the unordered-list
// bullet marker → `Dot`; checkboxes → `SquareCheck`/`Square`.

// Formatting (toolbar)
export { Bold as boldIcon } from "lucide-static";
export { Italic as italicIcon } from "lucide-static";
export { Strikethrough as strikethroughIcon } from "lucide-static";
export { Code as codeIcon } from "lucide-static";
export { Link as linkIcon } from "lucide-static";

// list-item markers (rendered by the node view)
export { Dot as bulletIcon } from "lucide-static";
export { SquareCheck as checkBoxCheckedIcon } from "lucide-static";
export { Square as checkBoxUncheckedIcon } from "lucide-static";

// block-edit: the "+" add control + the "::" drag grip, plus slash-menu commands
export { Plus as plusIcon } from "lucide-static";
export { GripVertical as menuIcon } from "lucide-static";
export { Type as textIcon } from "lucide-static";
export { Heading1 as h1Icon } from "lucide-static";
export { Heading2 as h2Icon } from "lucide-static";
export { Heading3 as h3Icon } from "lucide-static";
export { Heading4 as h4Icon } from "lucide-static";
export { Heading5 as h5Icon } from "lucide-static";
export { Heading6 as h6Icon } from "lucide-static";
export { Quote as quoteIcon } from "lucide-static";
export { Minus as dividerIcon } from "lucide-static";
export { List as bulletListIcon } from "lucide-static";
export { ListOrdered as orderedListIcon } from "lucide-static";
export { ListTodo as todoListIcon } from "lucide-static";

// link-tooltip: copy / edit / remove / confirm
export { Copy as copyIcon } from "lucide-static";
export { Pencil as editIcon } from "lucide-static";
export { Trash2 as removeIcon } from "lucide-static";
export { Check as confirmIcon } from "lucide-static";

// image-block
export { Image as imageIcon } from "lucide-static";
export { Captions as captionIcon } from "lucide-static";

// slash-menu "Table" command
export { Table as tableIcon } from "lucide-static";

// code-mirror: language picker (chevron / search / clear) + preview toggle
export { ChevronDown as chevronDownIcon } from "lucide-static";
export { Search as searchIcon } from "lucide-static";
export { X as clearIcon } from "lucide-static";
export { EyeOff as visibilityOffIcon } from "lucide-static";

// table: cell alignment + the row/col drag handles. Single 3-dot grips, oriented
// to the handle: the column handle (a horizontal strip atop the column) gets the
// horizontal `Ellipsis` (•••); the row handle (a vertical strip beside the row)
// gets the vertical `EllipsisVertical` (⋮).
export { AlignLeft as alignLeftIcon } from "lucide-static";
export { AlignCenter as alignCenterIcon } from "lucide-static";
export { AlignRight as alignRightIcon } from "lucide-static";
export { Ellipsis as colDragHandleIcon } from "lucide-static";
export { EllipsisVertical as rowDragHandleIcon } from "lucide-static";

// latex: the slash-menu "Math" command (Crepe's f(x) `functionsIcon`)
export { SquareFunction as functionsIcon } from "lucide-static";
