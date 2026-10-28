/**
 * The demo comparison shown for "?demo": a short recipe written as code,
 * edited so that it has changed, removed, added and unchanged lines.
 * @module demo
 */

import { createSession } from './session.js';

/** Old text of the demo. */
export const DEMO_LEFT = [
  '// Pancakes for two',
  'function pancakes(eggs) {',
  '  const flour = 200; // grams',
  '  const milk = 300; // millilitres',
  '  const sugar = 2; // spoons',
  '  mix(flour, milk, eggs);',
  '  rest(10);',
  '  return fry(sugar);',
  '}',
  '',
  'pancakes(2);',
  '',
].join('\n');

/** New text of the demo. */
export const DEMO_RIGHT = [
  '// Pancakes for four',
  'function pancakes(eggs, people = 4) {',
  '  const flour = 100 * people; // grams',
  '  const milk = 150 * people; // millilitres',
  '  mix(flour, milk, eggs);',
  '  rest(15);',
  '  const butter = 1; // spoon',
  '  return fry(butter);',
  '}',
  '',
  'pancakes(3);',
  '',
].join('\n');

/**
 * Builds the demo session: the demo texts in lines mode with the first
 * change selected.
 * @returns {import('./session.js').Session}
 */
export function createDemoSession() {
  const session = createSession({ left: DEMO_LEFT, right: DEMO_RIGHT });
  session.nextChange();
  return session;
}
