'use client';

import { useState } from 'react';
import { Undo2, Redo2, Search, PanelRight, Box, Move, Circle, Scissors, Compass } from 'lucide-react';
import { NAV_PRESETS, type NavPreset, type WorkbenchState } from './cad-workbench';
import { TooltipHint } from '@/components/magicui/tooltip';
import { Button } from '@/components/magicui/button';
import { Input } from '@/components/magicui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/magicui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/magicui/dropdown-menu';

// Chili3D's own native profile names, labeled with the real tool each one's bindings match
// (verified against the pinned upstream source) — not invented, and not claiming a "Fusion"
// profile that doesn't exist upstream.
const NAV_PRESET_LABEL: Record<NavPreset, string> = {
  Chili3d: 'Default',
  Revit: 'Revit-style',
  Blender: 'Blender-style',
  Creo: 'Creo-style',
  Solidworks: 'SolidWorks-style',
};

export type CadCommand = { key: string; label?: string; helpText?: string };
export const toolGroups = ['File', 'Edit', 'Create', 'Sketch', 'Constraints', 'Modify', 'Inspect', 'View', 'Other'];
export function groupFor(key: string) {
  const family = key.split('.')[0];
  return ({ doc: 'File', file: 'File', agenticCad: 'File', edit: 'Edit', create: 'Create', sketch: 'Sketch', constraint: 'Constraints', modify: 'Modify', boolean: 'Modify', convert: 'Modify', feature: 'Modify', measure: 'Inspect', workingPlane: 'View', act: 'View', view: 'View' } as Record<string, string>)[family] ?? 'Other';
}
export function commandLabel(command: CadCommand) {
  return command.label || command.key.replace(/\./g, ' / ').replace(/([a-z])([A-Z])/g, '$1 $2');
}

// Feature composition of registry Buttons, DropdownMenu and Input. The command
// registry stays authoritative; unknown future commands remain in Other/search.
export function ViewportTools({ commands, ready, execute, panels, togglePanels, state, cancel, canSave, setNavPreset }: {
  commands: CadCommand[]; ready: boolean; execute: (key: string) => void;
  panels: boolean; togglePanels: () => void;
  state: WorkbenchState; cancel: () => void; canSave: boolean;
  setNavPreset: (preset: NavPreset) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const matches = commands.filter(c => `${commandLabel(c)} ${c.key}`.toLowerCase().includes(query.toLowerCase()));
  const unavailable = (key: string) => !ready || (key === 'agenticCad.sendToReplicad' && !canSave);
  const contextKeys = state.selectedCount ? ['modify.move', 'modify.fillet', 'boolean.cut'] : ['create.box', 'sketch.create', 'create.circle'];
  const icons = { 'create.box': Box, 'sketch.create': Scissors, 'create.circle': Circle, 'modify.move': Move, 'modify.fillet': Circle, 'boolean.cut': Scissors };
  return <div className="cad-desktop-tools">
    <nav className="cad-menu-row" aria-label="CAD tools">
      {toolGroups.map(group => {
        const items = commands.filter(c => groupFor(c.key) === group);
        if (!items.length) return null;
        return <DropdownMenu key={group}><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" disabled={!ready}>{group}</Button></DropdownMenuTrigger>
          <DropdownMenuContent className="cad-command-menu cad-workbench-surface" align="start">{items.map(c => <DropdownMenuItem key={c.key} disabled={unavailable(c.key)} onSelect={() => execute(c.key)}>{commandLabel(c)}</DropdownMenuItem>)}</DropdownMenuContent>
        </DropdownMenu>;
      })}
    </nav>
    <div className="cad-action-row">
      {[['edit.undo', Undo2], ['edit.redo', Redo2]].map(([key, Icon]) => {
        const action = String(key);
        const Glyph = Icon as typeof Undo2;
        return <TooltipHint key={action} label={action === 'edit.undo' ? 'Undo' : 'Redo'}><Button size="icon-sm" variant="ghost" aria-label={action === 'edit.undo' ? 'Undo' : 'Redo'} disabled={!ready} onClick={() => execute(action)}><Glyph aria-hidden="true" /></Button></TooltipHint>;
      })}
      <span className="cad-toolbar-divider" aria-hidden="true" />
      {contextKeys.map(key => {
        const c = commands.find(c => c.key === key);
        const Icon = icons[key as keyof typeof icons];
        return c ? <Button key={key} size="sm" variant="ghost" disabled={!ready} onClick={() => execute(key)}><Icon aria-hidden="true" />{commandLabel(c)}</Button> : null;
      })}
      <span className="cad-toolbar-spacer" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" title={`Navigation: ${NAV_PRESET_LABEL[state.navPreset ?? 'Chili3d']}`} aria-label={`Navigation and shortcut style: ${NAV_PRESET_LABEL[state.navPreset ?? 'Chili3d']}`} disabled={!ready}><Compass aria-hidden="true" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="cad-command-menu cad-workbench-surface" align="end">
          {NAV_PRESETS.map((preset) => (
            <DropdownMenuItem key={preset} disabled={!ready} aria-pressed={(state.navPreset ?? 'Chili3d') === preset} onSelect={() => setNavPreset(preset)}>
              {NAV_PRESET_LABEL[preset]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <TooltipHint label="Objects and properties"><Button size="icon-sm" variant="ghost" aria-label="Objects and properties" aria-pressed={panels} disabled={!ready} onClick={togglePanels}><PanelRight aria-hidden="true" /></Button></TooltipHint>
      <Popover open={searchOpen} onOpenChange={setSearchOpen}>
      <PopoverTrigger asChild><Button size="icon-sm" variant="ghost" aria-label="Find tool"><Search aria-hidden="true" /></Button></PopoverTrigger>
      <PopoverContent className="cad-tool-search cad-workbench-surface" align="end" aria-label="Find a CAD tool">
      <Input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tools, e.g. fillet or constraint" aria-label="Search CAD tools" onKeyDown={e => { if (e.key === 'Escape') setSearchOpen(false); }} />
      <div className="cad-search-results">{matches.map(c => <Button variant="ghost" key={c.key} disabled={unavailable(c.key)} onClick={() => { execute(c.key); setSearchOpen(false); }}><span>{commandLabel(c)}</span><small>{groupFor(c.key)}</small></Button>)}{!matches.length && <p>No matching tools.</p>}</div>
      </PopoverContent>
      </Popover>
    </div>
    {state.activeCommand && <div className="cad-command-context" role="status"><span>{commandLabel(commands.find(c => c.key === state.activeCommand) ?? { key: state.activeCommand })}</span><span>{state.selectedCount ? `${state.selectedCount} selected` : 'Follow the canvas instructions'}</span>{state.canCancel && <Button size="sm" variant="ghost" onClick={cancel}>Cancel</Button>}</div>}
  </div>;
}
