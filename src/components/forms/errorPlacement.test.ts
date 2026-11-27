/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { childErrorsOf, embeddedErrorHome } from './errorPlacement';

const fields = { name: {}, certificateManagement: {}, dkimManagement: {} };
const domain = {
  name: 't.example',
  certificateManagement: { '@type': 'Automatic', acmeProviderId: 'a', subjectAlternativeNames: { 'x.example': true } },
  dkimManagement: { '@type': 'Manual' },
};

describe('embeddedErrorHome', () => {
  it('finds the embedded object that holds a refused property', () => {
    expect(embeddedErrorHome('subjectAlternativeNames', fields, domain)).toEqual({
      field: 'certificateManagement',
      child: 'subjectAlternativeNames',
    });
  });

  it('leaves the form’s own fields and paths as they were', () => {
    expect(embeddedErrorHome('name', fields, domain)).toBeNull();
    expect(embeddedErrorHome('certificateManagement/subjectAlternativeNames', fields, domain)).toBeNull();
  });

  it('is null when no object on the form holds it', () => {
    expect(embeddedErrorHome('unknown', fields, domain)).toBeNull();
    expect(embeddedErrorHome('subjectAlternativeNames', fields, { ...domain, certificateManagement: null })).toBeNull();
  });

  it('only looks in the form’s own fields', () => {
    expect(embeddedErrorHome('subjectAlternativeNames', { name: {} }, domain)).toBeNull();
  });
});

describe('childErrorsOf', () => {
  it('gives one object’s refusals by its field names', () => {
    const errors = { name: 'Taken.', 'certificateManagement/subjectAlternativeNames': 'Not yours.' };
    expect(childErrorsOf(errors, 'certificateManagement')).toEqual({ subjectAlternativeNames: 'Not yours.' });
    expect(childErrorsOf(errors, 'name')).toBeUndefined();
    expect(childErrorsOf(errors, 'certificate')).toBeUndefined();
  });
});
