import assert from 'node:assert/strict';

export async function assertTheme(page, selector, property, token) {
  // Navigation changes animate their color; assert the settled token, not an
  // arbitrary interpolated frame immediately after a rapid click.
  await page.waitForFunction(({ selector, property, token }) => {
    const probe = document.createElement('div'); probe.style.backgroundColor = `var(${token})`;
    document.body.appendChild(probe); const expected = getComputedStyle(probe).backgroundColor; probe.remove();
    const targets = [...document.querySelectorAll(selector)];
    return targets.length > 0 && targets.every(node => getComputedStyle(node).getPropertyValue(property) === expected);
  }, { selector, property, token });
  const result = await page.evaluate(({ selector, property, token }) => {
    const probe = document.createElement('div'); probe.style.backgroundColor = `var(${token})`;
    document.body.appendChild(probe); const expected = getComputedStyle(probe).backgroundColor; probe.remove();
    return { expected, actual: [...document.querySelectorAll(selector)].map(node => getComputedStyle(node).getPropertyValue(property)) };
  }, { selector, property, token });
  assert.ok(result.actual.length, `Missing theme target: ${selector}`);
  for (const actual of result.actual) assert.equal(actual, result.expected, `${selector} ${property} must match ${token}`);
}
