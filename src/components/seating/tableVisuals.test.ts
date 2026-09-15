import { describe, it, expect } from 'vitest';
import { seatVisual, tableOutline } from './tableVisuals';

// The canvas' highlight rules, asserted without a canvas: which outline wins,
// what a full table looks like, and how a picked chair is shown.

describe('tableOutline', () => {
  it('rests on the neutral outline', () => {
    expect(tableOutline({ isSelected: false, isFull: false, partyFocused: false, partyFits: false })).toEqual({
      stroke: '#CBAE94',
      strokeWidth: 2,
      dash: undefined,
      shadowColor: '#8B735B',
      shadowBlur: 4,
    });
  });

  it('marks a full table green', () => {
    const outline = tableOutline({ isSelected: false, isFull: true, partyFocused: false, partyFits: false });
    expect(outline.stroke).toBe('#10B981');
    expect(outline.strokeWidth).toBe(2);
  });

  it('gives the selection the dark outline and the brightest shadow', () => {
    const outline = tableOutline({ isSelected: true, isFull: false, partyFocused: false, partyFits: false });
    expect(outline).toMatchObject({ stroke: '#4A3F35', strokeWidth: 4, shadowBlur: 12 });
  });

  it('lets a focused party override the selection: green and thick when it fits', () => {
    const outline = tableOutline({ isSelected: true, isFull: true, partyFocused: true, partyFits: true });
    expect(outline).toMatchObject({ stroke: '#10B981', strokeWidth: 5, shadowColor: '#10B981', shadowBlur: 12 });
    expect(outline.dash).toBeUndefined();
  });

  it('draws a dashed red outline when the focused party does not fit', () => {
    const outline = tableOutline({ isSelected: false, isFull: false, partyFocused: true, partyFits: false });
    expect(outline).toMatchObject({ stroke: '#EF4444', strokeWidth: 2, dash: [4, 4] });
  });

  it('still shadows a selected table while a party that fits is focused', () => {
    const outline = tableOutline({ isSelected: true, isFull: false, partyFocused: true, partyFits: true });
    expect(outline.shadowBlur).toBe(12);
  });
});

describe('seatVisual', () => {
  it('shows an empty chair at rest', () => {
    expect(seatVisual({ occupied: false, isDropTarget: false, isPicked: false, pickMode: false })).toEqual({
      fill: '#FFFDF9',
      stroke: '#CBAE94',
      radius: 8,
    });
  });

  it('fills an occupied chair', () => {
    expect(seatVisual({ occupied: true, isDropTarget: false, isPicked: false, pickMode: false }).fill).toBe('#8B735B');
  });

  it('shows every free chair while a member is picked', () => {
    expect(seatVisual({ occupied: false, isDropTarget: false, isPicked: false, pickMode: true })).toMatchObject({
      fill: '#D1FAE5',
      stroke: '#059669',
    });
    // …but never a taken one.
    expect(seatVisual({ occupied: true, isDropTarget: false, isPicked: false, pickMode: true }).fill).toBe('#8B735B');
  });

  it('highlights the picked chair above the pick mode', () => {
    expect(seatVisual({ occupied: true, isDropTarget: false, isPicked: true, pickMode: true })).toMatchObject({
      fill: '#FDE68A',
      stroke: '#D97706',
    });
  });

  it('highlights a live drop target above everything, and grows it', () => {
    expect(seatVisual({ occupied: true, isDropTarget: true, isPicked: true, pickMode: true })).toEqual({
      fill: '#A7F3D0',
      stroke: '#059669',
      radius: 10,
    });
  });
});
