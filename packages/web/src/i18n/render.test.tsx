import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { ProfileForm } from "../profile/ProfileForm";
import { parseOwnProfile } from "../api/profileApi";
import { localeRegistry, getLanguage, setLanguage, translate } from ".";
import { formatNumber, formatWinRate } from "../statistics/presentation";

test("all locales render native selectors and survive authenticated profile decoding", () => {
  const original = getLanguage();
  try {
    for (const locale of localeRegistry) {
      setLanguage(locale.code, null);
      const profile = parseOwnProfile({
        profile: {
          id: "user",
          username: "Commander",
          displayName: "מפקד",
          avatarUrl: null,
          email: "player@example.test",
          createdAt: "2026-10-01T12:00:00Z",
          updatedAt: "2026-10-01T12:00:00Z",
          preferredLanguage: locale.code,
          preferredTheme: "dark",
        },
      });
      assert.equal(profile.preferredLanguage, locale.code);
      const selector = renderToStaticMarkup(<LanguageSwitcher />);
      assert.equal((selector.match(/<option /g) ?? []).length, localeRegistry.length);
      assert.match(selector, new RegExp(`value="${locale.code}"[^>]*selected=""`));
      for (const option of localeRegistry) assert.ok(selector.includes(option.label));
      const form = renderToStaticMarkup(
        <ProfileForm profile={profile} onSave={async () => profile} onCancel={() => {}} />,
      );
      assert.equal((form.match(/name="preferredLanguage"/g) ?? []).length, 1);
      assert.ok(form.includes(translate("profile.save")));
      assert.doesNotMatch(form, /\{\{|profile\.save|language\.switchLabel/);
      assert.equal(
        formatNumber(12345.6, locale.code, 1),
        new Intl.NumberFormat(locale.code, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(12345.6),
      );
      assert.equal(
        formatWinRate(0.456, locale.code),
        new Intl.NumberFormat(locale.code, { style: "percent", maximumFractionDigits: 1 }).format(
          0.456,
        ),
      );
    }
  } finally {
    setLanguage(original, null);
  }
});
