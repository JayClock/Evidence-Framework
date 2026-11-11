import {
  DEFAULT_MINOR_DIVISIONS,
  getRulerTicks,
  pickRulerStep,
} from '../index.js';

describe('ruler math', () => {
  it('picks a readable ladder step for the zoom', () => {
    expect(pickRulerStep(80, 1)).toBe(100);
    expect(pickRulerStep(80, 2)).toBe(50);
    expect(pickRulerStep(80, 0.25)).toBe(500);
    expect(pickRulerStep(80, 0)).toBe(100);
  });

  it('extends the ladder instead of returning a tiny step', () => {
    expect(pickRulerStep(100000, 1)).toBe(100000);
  });

  it('emits aligned major and minor ticks for the visible range', () => {
    const ticks = getRulerTicks({
      worldStart: 0,
      worldEnd: 220,
      zoom: 1,
      pan: 0,
      minMajorStepPx: 80,
    });

    expect(ticks[0]).toEqual({ value: 0, position: 0, level: 'major' });
    expect(ticks.at(-1)).toEqual({ value: 220, position: 220, level: 'minor' });

    const majors = ticks.filter(({ level }) => level === 'major');

    expect(majors.map(({ value }) => value)).toEqual([0, 100, 200]);
    expect(ticks).toHaveLength(12);
    expect(ticks.filter(({ level }) => level === 'minor')).toHaveLength(9);
    expect(ticks.every(({ value }) => value % 20 === 0)).toBe(true);
  });

  it('keeps ticks on the world grid when panning', () => {
    const ticks = getRulerTicks({
      worldStart: 0,
      worldEnd: 100,
      zoom: 2,
      pan: 50,
      minMajorStepPx: 80,
    });

    expect(ticks[0]?.value).toBe(0);
    expect(ticks[0]?.position).toBe(50);
    expect(ticks[1]?.position).toBeCloseTo(70, 6);
  });

  it('uses the default subdivision count for degenerate input', () => {
    const ticks = getRulerTicks({
      worldStart: 0,
      worldEnd: 50,
      zoom: 1,
      pan: 0,
      minorDivisions: 1,
    });

    expect(DEFAULT_MINOR_DIVISIONS).toBe(5);
    expect(ticks.filter(({ level }) => level === 'minor').length).toBe(2);
  });

  it('returns no ticks for empty or invalid ranges', () => {
    expect(
      getRulerTicks({ worldStart: 10, worldEnd: 10, zoom: 1, pan: 0 }),
    ).toEqual([]);
    expect(
      getRulerTicks({
        worldStart: Number.NaN,
        worldEnd: 10,
        zoom: 1,
        pan: 0,
      }),
    ).toEqual([]);
  });
});
