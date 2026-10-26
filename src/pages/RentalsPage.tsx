import { useState } from "react";
import { Alert } from "../components/ui";
import { OffersTab } from "../features/rentals/OffersTab";
import { RequestsTab } from "../features/rentals/RequestsTab";
import { de } from "../lib/de";

const t = de.rent;

type Tab = "offers" | "mine" | "incoming";
const tabs: Tab[] = ["offers", "mine", "incoming"];

export default function RentalsPage() {
  const [tab, setTab] = useState<Tab>("offers");
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <div role="group" aria-label={t.tabs.label} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {tabs.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => {
              setTab(value);
              setNotice(null);
            }}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium ${
              tab === value ? "bg-neutral-900 text-white" : "bg-white text-neutral-800 ring-1 ring-neutral-300"
            }`}
          >
            {t.tabs[value]}
          </button>
        ))}
      </div>

      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {tab === "offers" ? (
        <OffersTab
          onSent={() => {
            setNotice(t.request.sent);
            setTab("mine");
          }}
        />
      ) : null}
      {tab === "mine" ? <RequestsTab role="requester" /> : null}
      {tab === "incoming" ? <RequestsTab role="owner" /> : null}
    </div>
  );
}
