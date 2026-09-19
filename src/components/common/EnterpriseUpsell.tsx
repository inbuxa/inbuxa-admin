/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

interface EnterpriseUpsellProps {
  open: boolean;
  onClose: () => void;
}

/**
 * INBUXA: nothing to sell. There is one edition, every feature is in it, and
 * the edition is never anything but complete (see accountStore), so this
 * never opens. It stays as an empty component so the places upstream calls
 * it from merge without conflicts.
 */
export function EnterpriseUpsell({ open }: EnterpriseUpsellProps) {
  void open;
  return null;
}
