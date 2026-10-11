import { expect, it } from "vitest";
import { messageReferences } from "../scripts/message-references.mjs";

it("resolves root and nested server namespaces without mixing function scopes", () => {
  expect(messageReferences(`
    async function account() {
      const t = await getTranslations("studyflow");
      t("accountEmails.instructions");
      t(reset ? "accountEmails.resetSubject" : "accountEmails.verifySubject");
    }
    async function welcome(locale) {
      const t = await getTranslations({ locale, namespace: "studyflow.accountEmails" });
      t("welcomeSubject");
      t("missingKey");
    }
  `, "email.ts")).toEqual([
    "accountEmails.instructions", "accountEmails.resetSubject", "accountEmails.verifySubject",
    "accountEmails.welcomeSubject", "accountEmails.missingKey",
  ]);
});

it("recognizes aliased client translators and restores outer bindings after a block", () => {
  expect(messageReferences(`
    function Component() {
      const copy = useTranslations("studyflow.redesign");
      copy("philosophy");
      { const copy = useTranslations("other"); copy("ignored"); }
      copy("authStory");
      { const copy = value => value; copy("alsoIgnored"); }
    }
  `, "component.tsx")).toEqual(["redesign.philosophy", "redesign.authStory"]);
});
