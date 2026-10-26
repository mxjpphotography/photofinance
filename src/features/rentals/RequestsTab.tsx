import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Alert, Badge, Button, Textarea } from "../../components/ui";
import { de } from "../../lib/de";
import { mapDbError } from "../../lib/errors";
import { formatDate } from "../../lib/money";
import { actionsFor, groupByRequest, type ItemAction } from "../../lib/rentals";
import type { RentalItem } from "../../lib/types";
import { useDecideItem, usePersonNames, useRentalItems, useRentalRequests } from "./api";

const t = de.rent.list;

type Role = "requester" | "owner";

function ItemRow({
  item,
  role,
  me,
  names,
  onNotice,
}: {
  item: RentalItem;
  role: Role;
  me: string;
  names: Map<string, string>;
  onNotice: (n: { tone: "success" | "error"; text: string }) => void;
}) {
  const decide = useDecideItem();
  const [note, setNote] = useState("");
  const actions = actionsFor(item, me);
  const person = role === "requester" ? item.owner_id : item.requester_id;
  const personName = names.get(person) ?? t.unknownPerson;

  async function run(action: ItemAction) {
    if (action === "cancel" && !window.confirm(t.cancelConfirm)) return;
    const status = action === "accept" ? "accepted" : action === "decline" ? "declined" : "cancelled";
    // Only the owner may write a note, and only when deciding.
    const withNote = role === "owner" && (action === "accept" || action === "decline") && note.trim() !== "";
    try {
      await decide.mutateAsync({ id: item.id, status, note: withNote ? note.trim() : undefined });
      onNotice({ tone: "success", text: action === "accept" ? t.accepted : action === "decline" ? t.declined : t.cancelled });
    } catch (error) {
      onNotice({ tone: "error", text: mapDbError(error) });
    }
  }

  return (
    <div className="space-y-2 border-t border-neutral-100 pt-3 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{item.equipment_name}</span>
        <Badge tone={item.status === "accepted" ? "info" : "neutral"}>{de.rent.status[item.status]}</Badge>
        <span className="text-sm text-neutral-700">{t.units.replace("{n}", String(item.units))}</span>
      </div>
      <p className="text-sm text-neutral-700">{role === "requester" ? t.owner.replace("{name}", personName) : t.requester.replace("{name}", personName)}</p>
      {item.decision_note ? (
        <p className="text-sm text-neutral-700">
          {t.note}: {item.decision_note}
        </p>
      ) : null}
      {actions.includes("accept") ? (
        <Textarea id={`note-${item.id}`} label={t.noteLabel} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      ) : null}
      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a} variant={a === "accept" ? "primary" : "secondary"} disabled={decide.isPending} onClick={() => void run(a)}>
              {t[a]}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Requests the person made (role "requester") or received for own equipment (role "owner"). */
export function RequestsTab({ role }: { role: Role }) {
  const { session } = useAuth();
  const me = session?.user.id ?? "";
  const items = useRentalItems();
  const requests = useRentalRequests();
  const mine = (items.data ?? []).filter((i) => (role === "requester" ? i.requester_id === me : i.owner_id === me));
  const names = usePersonNames(mine.flatMap((i) => [i.owner_id, i.requester_id]));
  const purposeById = new Map((requests.data ?? []).map((r) => [r.id, r.purpose]));
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  if (items.isLoading) return <p role="status">{de.common.loading}</p>;
  if (items.isError)
    return (
      <div className="space-y-3">
        <Alert tone="error">{t.loadError}</Alert>
        <Button variant="secondary" onClick={() => void items.refetch()}>
          {de.common.retry}
        </Button>
      </div>
    );

  const groups = groupByRequest(mine);
  return (
    <div className="space-y-3">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      {groups.length === 0 ? <p className="text-neutral-700">{role === "requester" ? t.emptyMine : t.emptyIncoming}</p> : null}
      {groups.map((group) => {
        const first = group[0];
        return (
          <section key={first.request_id} className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-neutral-200">
            <p className="text-sm font-semibold">{t.period.replace("{from}", formatDate(first.start_date)).replace("{to}", formatDate(first.end_date))}</p>
            {purposeById.get(first.request_id) ? (
              <p className="whitespace-pre-line text-sm text-neutral-700">
                {t.purpose}: {purposeById.get(first.request_id)}
              </p>
            ) : null}
            {group.map((item) => (
              <ItemRow key={item.id} item={item} role={role} me={me} names={names.data ?? new Map()} onNotice={setNotice} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
