/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { lazy } from 'react';

/** The signed-in console, loaded only once someone is signed in. */
export const AdminPanel = lazy(() => import('./AdminPanel'));
