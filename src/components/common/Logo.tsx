/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { getLogoState, loadLogoOnce, subscribeToLogo } from '@/lib/logoCache';
import inbuxaMark from '@/assets/inbuxa-mark.png';

export function DefaultLogo() {
  const { t } = useTranslation();
  // The INBUXA compact lockup: the mark as an image, the wordmark as vector
  // paths in the current text color, so it reads on light and dark themes.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="165 35 616 130"
      aria-label={t('logo.inbuxaAlt', 'inbuxa')}
      className="h-7 w-auto max-w-[320px]"
    >
      <image x="165.85" y="35.00" width="109.39" height="130.00" href={inbuxaMark} />
      <path
        className="fill-current"
        d="M70 0V496H196V0ZM133 554Q99 554 75.5 576.0Q52 598 52 634Q52 670 75.5 692.0Q99 714 133 714Q168 714 191.0 692.0Q214 670 214 634Q214 598 191.0 576.0Q168 554 133 554Z"
        transform="translate(303.25,151.90) scale(0.150000,-0.150000)"
      />
      <path
        className="fill-current"
        d="M70 0V496H194V431H212Q224 457 257.0 480.5Q290 504 357 504Q415 504 458.5 477.5Q502 451 526.0 404.5Q550 358 550 296V0H424V286Q424 342 396.5 370.0Q369 398 318 398Q260 398 228.0 359.5Q196 321 196 252V0Z"
        transform="translate(340.15,151.90) scale(0.150000,-0.150000)"
      />
      <path
        className="fill-current"
        d="M368 -14Q301 -14 265.0 9.0Q229 32 212 60H194V0H70V700H196V439H214Q225 457 243.5 473.0Q262 489 292.5 499.5Q323 510 368 510Q428 510 479.0 480.5Q530 451 561.0 394.0Q592 337 592 256V240Q592 159 561.0 102.0Q530 45 479.0 15.5Q428 -14 368 -14ZM330 96Q388 96 427.0 133.5Q466 171 466 243V253Q466 325 427.5 362.5Q389 400 330 400Q272 400 233.0 362.5Q194 325 194 253V243Q194 171 233.0 133.5Q272 96 330 96Z"
        transform="translate(429.55,151.90) scale(0.150000,-0.150000)"
      />
      <path
        className="fill-current"
        d="M259 -8Q201 -8 157.5 18.5Q114 45 90.0 92.0Q66 139 66 200V496H192V210Q192 154 219.5 126.0Q247 98 298 98Q356 98 388.0 136.5Q420 175 420 244V496H546V0H422V65H404Q392 40 359.0 16.0Q326 -8 259 -8Z"
        transform="translate(522.25,151.90) scale(0.150000,-0.150000)"
      />
      <path
        className="fill-current"
        d="M26 0 206 250 28 496H174L287 331H305L418 496H564L386 250L566 0H418L305 167H287L174 0Z"
        transform="translate(611.65,151.90) scale(0.150000,-0.150000)"
      />
      <path
        className="fill-current"
        d="M224 -14Q171 -14 129.0 4.5Q87 23 62.5 58.5Q38 94 38 145Q38 196 62.5 230.5Q87 265 130.5 282.5Q174 300 230 300H366V328Q366 363 344.0 385.5Q322 408 274 408Q227 408 204.0 386.5Q181 365 174 331L58 370Q70 408 96.5 439.5Q123 471 167.5 490.5Q212 510 276 510Q374 510 431.0 461.0Q488 412 488 319V134Q488 104 516 104H556V0H472Q435 0 411.0 18.0Q387 36 387 66V67H368Q364 55 350.0 35.5Q336 16 306.0 1.0Q276 -14 224 -14ZM246 88Q299 88 332.5 117.5Q366 147 366 196V206H239Q204 206 184.0 191.0Q164 176 164 149Q164 122 185.0 105.0Q206 88 246 88Z"
        transform="translate(697.45,151.90) scale(0.150000,-0.150000)"
      />
    </svg>
  );
}

export default function Logo() {
  const { t } = useTranslation();
  const logo = useSyncExternalStore(subscribeToLogo, getLogoState, getLogoState);

  useEffect(() => {
    loadLogoOnce();
  }, []);

  if (logo.status === 'custom') {
    return <img src={logo.url} alt={t('logo.alt', 'Logo')} className="h-7 w-auto max-w-[220px] object-contain" />;
  }

  if (logo.status === 'loading') {
    return <span className="block h-7 w-[140px]" aria-hidden="true" />;
  }

  return <DefaultLogo />;
}
