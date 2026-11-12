"use client";

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { syncAction, type SyncState } from "./actions";
import type { InboxKpis, InboxRow } from "@/lib/dashboard";

// AG Grid Community only (MIT). No enterprise modules are used.
ModuleRegistry.registerModules([AllCommunityModule]);

/** Grid colours come from the page's CSS variables, so it follows light and dark mode. */
const theme = themeQuartz.withParams({
  backgroundColor: "var(--surface)",
  foregroundColor: "var(--fg)",
  borderColor: "var(--line)",
  headerBackgroundColor: "var(--bg)",
  chromeBackgroundColor: "var(--bg)",
  accentColor: "var(--accent)",
  browserColorScheme: "inherit",
  fontFamily: "inherit",
  fontSize: 14,
  headerFontWeight: 600,
  rowHoverColor: "var(--neutral-bg)",
  wrapperBorderRadius: 10,
});

const REFRESH_MS = 5000;

const STATE_LABEL: Record<string, string> = {
  NEW: "New",
  GATHERING: "Gathering evidence",
  SCORED: "Scored",
  DRAFTED: "Drafted",
  AWAITING_APPROVAL: "Needs your approval",
  APPROVED: "Approved",
  SUBMITTED: "Submitted",
  RESOLVED: "Resolved",
  MANUAL: "Handled manually",
};
const BAND_LABEL = { CONTEST: "Contest", OFFER: "Offer", ACCEPT: "Accept" } as const;

function timeLeft(dueAt: string | null, now: number) {
  if (!dueAt) return { label: "No deadline", urgent: false, ms: Number.POSITIVE_INFINITY };
  const ms = new Date(dueAt).getTime() - now;
  if (ms <= 0) return { label: "Overdue", urgent: true, ms };
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  return { label: d > 0 ? `${d}d ${h % 24}h left` : `${h}h left`, urgent: h < 72, ms };
}

function DueCell({ data, context }: CustomCellRendererProps<InboxRow>) {
  if (!data) return null;
  if (data.state === "RESOLVED") return <span className="muted">-</span>;
  const t = timeLeft(data.dueAt, (context as { now: number }).now);
  return <span className={t.urgent ? "no" : ""}>{t.label}</span>;
}

function BandCell({ data }: CustomCellRendererProps<InboxRow>) {
  if (!data?.band) return <span className="muted">Not scored yet</span>;
  return (
    <span className={`rec rec-${data.band.toLowerCase()}`}>
      {BAND_LABEL[data.band]}
      {data.band === "OFFER" && data.offerAmount ? ` $${data.offerAmount}` : ""} · {data.score}
    </span>
  );
}

function StateCell({ data }: CustomCellRendererProps<InboxRow>) {
  if (!data) return null;
  return <span className={`pill pill-${data.state.toLowerCase()}`}>{STATE_LABEL[data.state] ?? data.state}</span>;
}

function CheckCell({ data }: CustomCellRendererProps<InboxRow>) {
  if (data?.draftOk == null) return <span className="muted">-</span>;
  return data.draftOk ? <span className="yes">✓ Passed</span> : <span className="no">✗ Failed</span>;
}

function IdCell({ data }: CustomCellRendererProps<InboxRow>) {
  if (!data) return null;
  return (
    <span>
      <code className="cite">{data.id}</code>
      {data.source === "demo" && <span className="muted small"> demo</span>}
    </span>
  );
}

function money(n: number, currency: string) {
  return currency === "USD" ? `$${n.toFixed(2)}` : `${n.toFixed(2)} ${currency}`;
}

export function Inbox({ initialRows, initialKpis }: { initialRows: InboxRow[]; initialKpis: InboxKpis }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [kpis, setKpis] = useState(initialKpis);
  const [now, setNow] = useState(() => Date.now());
  const [updated, setUpdated] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sync, syncForm, syncing] = useActionState<SyncState, FormData>(syncAction, { message: null, error: null });

  // Poll the API so new disputes and webhook updates appear without reloading.
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/disputes", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { rows: InboxRow[]; kpis: InboxKpis };
        if (stopped) return;
        setRows(data.rows);
        setKpis(data.kpis);
        setNow(Date.now());
        setUpdated(new Date());
        setError(null);
      } catch (err) {
        if (!stopped) setError(`Live refresh paused: ${(err as Error).message}`);
      }
    };
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  const columns = useMemo<ColDef<InboxRow>[]>(
    () => [
      { field: "id", headerName: "Dispute", cellRenderer: IdCell, width: 175, pinned: "left", filter: "agTextColumnFilter" },
      { field: "item", headerName: "Item", flex: 2, minWidth: 190, filter: "agTextColumnFilter", tooltipField: "item" },
      {
        field: "amount",
        headerName: "Amount",
        width: 105,
        type: "rightAligned",
        filter: "agNumberColumnFilter",
        valueFormatter: (p) => (p.data ? money(p.data.amount, p.data.currency) : ""),
      },
      {
        field: "score",
        headerName: "Recommendation",
        width: 165,
        cellRenderer: BandCell,
        filter: "agNumberColumnFilter",
        filterParams: { buttons: ["reset"] },
      },
      {
        field: "state",
        headerName: "Status",
        width: 185,
        cellRenderer: StateCell,
        filter: "agTextColumnFilter",
        filterValueGetter: (p) => (p.data ? STATE_LABEL[p.data.state] : ""),
      },
      {
        colId: "due",
        headerName: "Respond by",
        width: 120,
        cellRenderer: DueCell,
        valueGetter: (p) => (p.data?.dueAt ? new Date(p.data.dueAt).getTime() : Number.POSITIVE_INFINITY),
        sort: "asc",
        filter: false,
      },
      { field: "claim", headerName: "Claim", width: 150, filter: "agTextColumnFilter" },
      { field: "buyer", headerName: "Buyer", flex: 1, minWidth: 150, filter: "agTextColumnFilter" },
      { field: "draftOk", headerName: "Citations", width: 110, cellRenderer: CheckCell, filter: false },
      { field: "evidence", headerName: "Records", width: 95, type: "rightAligned", filter: "agNumberColumnFilter" },
    ],
    [],
  );

  return (
    <div className="stack">
      <div className="kpis">
        <div className="kpi">
          <span className="kpi-num">{kpis.open}</span>
          <span className="kpi-label">Open disputes</span>
        </div>
        <div className="kpi">
          <span className={`kpi-num ${kpis.needsApproval ? "attn" : ""}`}>{kpis.needsApproval}</span>
          <span className="kpi-label">Need your approval</span>
        </div>
        <div className="kpi">
          <span className={`kpi-num ${kpis.dueSoon ? "no" : ""}`}>{kpis.dueSoon}</span>
          <span className="kpi-label">Due within 3 days</span>
        </div>
        <div className="kpi">
          <span className="kpi-num">{money(kpis.amountAtStake, "USD")}</span>
          <span className="kpi-label">Amount in dispute</span>
        </div>
        <div className="kpi">
          <span className="kpi-num small-num">
            <span className="rec rec-contest">{kpis.contest} contest</span> <span className="rec rec-offer">{kpis.offer} offer</span>{" "}
            <span className="rec rec-accept">{kpis.accept} accept</span>
          </span>
          <span className="kpi-label">Agent recommendations</span>
        </div>
        <div className="kpi">
          <span className="kpi-num small-num">
            <span className="rec rec-contest">{kpis.won} won</span> <span className="rec rec-accept">{kpis.lost} lost</span>{" "}
            <span className="rec rec-offer">{kpis.settled + kpis.conceded} settled or accepted</span>
          </span>
          <span className="kpi-label">Results so far</span>
        </div>
      </div>

      <div className="row spread">
        <input
          id="inbox-search"
          type="search"
          placeholder="Search disputes, items, buyers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search disputes"
        />
        <div className="row">
          <span className="muted small" role="status">
            {error ?? (updated ? `Live · updated ${updated.toLocaleTimeString()}` : `Live · refreshes every ${REFRESH_MS / 1000}s`)}
          </span>
          <form action={syncForm}>
            <button type="submit" className="secondary" disabled={syncing}>
              {syncing ? "Checking PayPal…" : "Check PayPal for updates"}
            </button>
          </form>
        </div>
      </div>
      {(sync.message || sync.error) && <p className={sync.error ? "no small" : "muted small"}>{sync.error ?? sync.message}</p>}

      <div className="grid-wrap">
        <AgGridReact<InboxRow>
          theme={theme}
          rowData={rows}
          columnDefs={columns}
          defaultColDef={{ sortable: true, resizable: true, filter: true, floatingFilter: false }}
          getRowId={(p) => p.data.id}
          quickFilterText={search}
          context={{ now }}
          domLayout="autoHeight"
          rowHeight={46}
          animateRows
          onRowClicked={(e) => e.data && router.push(`/disputes/${encodeURIComponent(e.data.id)}`)}
          rowClass="clickable-row"
          overlayNoRowsTemplate="No disputes yet. New PayPal disputes appear here automatically."
        />
      </div>
      <p className="muted small">Click a row to open the dispute. Sort or filter by any column.</p>
    </div>
  );
}
