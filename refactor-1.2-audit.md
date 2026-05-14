# StudioPage.tsx Refactor Phase 1.2 Audit

## 1. Target Components to Extract

### `src/components/studio/StudioHeader.tsx`
Currently implemented as `StudioTopBar` (located in `src/components/studio/index.tsx`). This acts as the Top Header containing the Library button, the Canvas toggles (`activeView`), the Video/Slides toggles (`renderMode`), and the Publish/Export buttons.

### `src/components/studio/SidebarControls.tsx`
Currently the "Left Panel" embedded directly in `src/pages/StudioPage.tsx`. It handles the side navigation (Script, Brand, Chapters, etc.) and the rendering of the active tab's panel component.

## 2. Dependency Graph (Props Mapping)

### `StudioHeader`
**Outgoing Props (Passed from parent `StudioPage.tsx`):**
To make this a stateless UI component, we will pass its state via props instead of having it directly consume Zustand:
- `activeView: string`
- `setActiveView: (view: string) => void`
- `renderMode: string`
- `setRenderMode: (mode: string) => void`
- `onNavigateHome: () => void`

**Incoming State (Imported directly):**
- Core UI components (`cn`, `Button`, `Avatar`) and Icons (`I`).

### `SidebarControls`
**Outgoing Props (Passed from parent `StudioPage.tsx`):**
- `isPanelOpen: boolean`
- `activeTab: string`
- `setActiveTab: (tab: string) => void`
- `tabs: Array<{ id: string, label: string, icon: any, component: React.FC }>` (Passing `STUDIO_TABS` down keeps the layout config centralized).

**Incoming State (Imported directly):**
- `RenderConstants` (`PANEL_WIDTH`, `PANEL_SPRING`) for Framer Motion animation values.

## 3. Guarded Logic (Do Not Break)

**OFF-LIMITS:**
- The `activeView` and `renderMode` logic **MUST** continue working exactly as it currently does. The Video and Slides toggle buttons must remain visible for the 'video' `activeView`, and switching views must flawlessly swap the `<SOPCanvas />`, `<VideoCanvas />`, and `<DemoCanvas />` components.
- Do **NOT** re-introduce any `session.videoKey` or `hasVideo` guards into the header or the toggles.

## 4. Execution Plan

1. **Extract `StudioHeader.tsx`**: 
   - Create `src/components/studio/StudioHeader.tsx`.
   - Copy the `StudioTopBar` JSX and logic from `index.tsx`.
   - Define a `StudioHeaderProps` interface.
   - Refactor it to use the props instead of `useStudioStore()`.
   - Update `StudioPage.tsx` to render `<StudioHeader />` and pass down the Zustand state.
   - Remove `StudioTopBar` from `index.tsx` and fix any lingering exports.

2. **Extract `SidebarControls.tsx`**:
   - Create `src/components/studio/SidebarControls.tsx`.
   - Move the `<AnimatePresence>` Left Panel block out of `StudioPage.tsx`.
   - Define a `SidebarControlsProps` interface.
   - Import `RenderConstants` into the new file.
   - Render `<SidebarControls />` inside `StudioPage.tsx`.

3. **Verify Refactor**:
   - Check that UI states (Canvas switcher, Header buttons) are completely intact.
   - Run `npm run build` (via TS compiler) to ensure there are no prop type mismatches or missing imports.
