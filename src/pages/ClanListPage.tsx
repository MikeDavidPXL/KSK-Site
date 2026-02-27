// Clan List — staff-only admin page, neon purple accent
// CSV import, manual member add, inline editing, promotion management
import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Navigate, Link } from "react-router-dom";
import {
  Users,
  ArrowLeft,
  Loader2,
  Upload,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  FilterX,
  LogOut,
  Plus,
  Save,
  X,
  AlertTriangle,
  Zap,
  Check,
  Trash2,
  Shield,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import * as XLSX from "xlsx";
import clanLogo from "@/assets/clan-logo.png";
import PromotionQueueSection from "@/components/PromotionQueueSection";

// ── Types ─────────────────────────────────────────────────
interface ClanMember {
  id: string;
  discord_name: string;
  discord_id: string | null;
  ign: string;
  uid: string;
  join_date: string;
  status: "active" | "inactive";
  has_420_tag: boolean;
  rank_current: string;
  rank_next: string | null;
  frozen_days: number;
  counting_since: string | null;
  promote_eligible: boolean;
  promote_reason: string | null;
  needs_resolution: boolean;
  source: string;
  time_in_clan_days: number;
  days_until_next_rank: string | number;
  created_at: string;
  updated_at: string;
  // Archived/sync fields
  in_guild?: boolean;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
  left_guild_at?: string | null;
}

interface PromotionEntry {
  member_id: string;
  discord_name: string;
  discord_id: string | null;
  ign: string;
  uid: string;
  from_rank: string;
  to_rank: string;
  time_in_clan_days: number;
  reason: string;
  needs_resolution: boolean;
}

interface PromotionPreview {
  promotions: PromotionEntry[];
  total_due: number;
  threshold_met: boolean;
  unresolved: {
    member_id: string;
    discord_name: string;
    ign: string;
    uid: string;
    from_rank: string;
    to_rank: string;
  }[];
}

interface ResolveCandidate {
  label: string;
  sublabel: string;
  resolve_token: string;
}

const RANKS = ["Private", "Corporal", "Sergeant", "Lieutenant", "Major"];

// Rank order for sorting (higher index = higher rank)
const RANK_ORDER: Record<string, number> = {
  Private: 0,
  Corporal: 1,
  Sergeant: 2,
  Lieutenant: 3,
  Major: 4,
};

// Sortable columns
type SortKey =
  | "discord_name"
  | "ign"
  | "uid"
  | "join_date"
  | "time_in_clan_days"
  | "status"
  | "rank_current"
  | "rank_next"
  | "days_until_next_rank";
type SortDirection = "asc" | "desc";

// ══════════════════════════════════════════════════════════
//  CLAN LIST PAGE
// ══════════════════════════════════════════════════════════
const ClanListPage = () => {
  const { user, loading: authLoading } = useAuth();

  // ── Members state ───────────────────────────────────────
  const [members, setMembers] = useState<ClanMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [promoDueCount, setPromoDueCount] = useState(0);
  const [unresolvedCount, setUnresolvedCount] = useState(0);

  // ── Filters ─────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [promoFilter, setPromoFilter] = useState("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // ── Sorting ─────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // ── Upload state ────────────────────────────────────────
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    imported: number;
    updated: number;
    unresolved: number;
    errors: string[];
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Add member form ─────────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    discord_name: "",
    resolve_token: "",
    ign: "",
    uid: "",
    join_date: new Date().toISOString().split("T")[0],
    status: "active" as "active" | "inactive",
    has_420_tag: false,
    rank_current: "Private",
    source: "manual" as const,
  });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveCandidates, setResolveCandidates] = useState<ResolveCandidate[]>(
    []
  );
  const [saveUnresolvedAllowed, setSaveUnresolvedAllowed] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);

  // ── Manual unresolved resolver ──────────────────────────
  const [resolveTargetId, setResolveTargetId] = useState<string | null>(null);
  const [resolveQuery, setResolveQuery] = useState("");
  const [resolveTargetToken, setResolveTargetToken] = useState("");
  const [resolveTargetCandidates, setResolveTargetCandidates] = useState<ResolveCandidate[]>([]);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveSaving, setResolveSaving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // ── Inline discord_name editing ─────────────────────────
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");

  // ── Inline editing ──────────────────────────────────────
  const [savingField, setSavingField] = useState<string | null>(null);

  // ── Promotions ──────────────────────────────────────────
  const [promoPreview, setPromoPreview] = useState<PromotionPreview | null>(
    null
  );
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoRunning, setPromoRunning] = useState(false);
  const [promoResult, setPromoResult] = useState<string | null>(null);
  const [showForceConfirm, setShowForceConfirm] = useState(false);

  // ── Bulk resolve ────────────────────────────────────────
  const [bulkResolving, setBulkResolving] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  // ── Discord sync ────────────────────────────────────────
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);

  // ── Manual promotion ────────────────────────────────────
  const [manualPromoMemberId, setManualPromoMemberId] = useState<string | null>(null);
  const [manualPromoNewRank, setManualPromoNewRank] = useState<string>("");
  const [manualPromoRunning, setManualPromoRunning] = useState(false);
  const [manualPromoResult, setManualPromoResult] = useState<string | null>(null);

  // ── Fetch members ───────────────────────────────────────
  const fetchMembers = useCallback(
    async (pg: number, q: string) => {
      setMembersLoading(true);
      try {
        const params = new URLSearchParams({ page: String(pg) });
        if (q) params.set("search", q);
        if (statusFilter) params.set("status", statusFilter);
        if (tagFilter) params.set("has_420_tag", tagFilter);
        if (promoFilter) params.set("promotion_due", promoFilter);
        if (showArchived) params.set("show_archived", "true");

        const res = await fetch(
          `/.netlify/functions/clan-list-members?${params}`
        );
        const data = await res.json();
        if (!res.ok) {
          setUiError(data?.error || "Failed to load clan list.");
          setMembers([]);
          return;
        }
        setMembers(data.members ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.total_pages ?? 1);
        setPromoDueCount(data.promotion_due_count ?? 0);
        setUnresolvedCount(data.unresolved_count ?? 0);
        setArchivedCount(data.archived_count ?? 0);
      } catch {
        setUiError("Network error while loading clan list.");
        setMembers([]);
      } finally {
        setMembersLoading(false);
      }
    },
    [statusFilter, tagFilter, promoFilter, showArchived]
  );

  useEffect(() => {
    if (user?.is_staff) fetchMembers(page, debouncedSearch);
  }, [user, page, debouncedSearch, fetchMembers]);

  // ── Debounced search ────────────────────────────────────
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 400);
  };

  // ── Clear all filters ──────────────────────────────────
  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("");
    setTagFilter("");
    setPromoFilter("");
    setSortKey(null);
    setSortDirection("asc");
    setPage(1);
  };

  const hasActiveFilters =
    search !== "" ||
    statusFilter !== "" ||
    tagFilter !== "" ||
    promoFilter !== "" ||
    sortKey !== null;

  // ── Sorting handler ────────────────────────────────────
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Default direction per column type
      const defaultDesc: SortKey[] = [
        "join_date",
        "time_in_clan_days",
        "rank_current",
        "rank_next",
      ];
      setSortDirection(defaultDesc.includes(key) ? "desc" : "asc");
    }
  };

  // ── Sort members client-side ───────────────────────────
  const sortedMembers = [...members].sort((a, b) => {
    if (!sortKey) return 0;
    const dir = sortDirection === "asc" ? 1 : -1;

    switch (sortKey) {
      case "discord_name":
        return dir * a.discord_name.localeCompare(b.discord_name);
      case "ign":
        return dir * a.ign.localeCompare(b.ign);
      case "uid": {
        const aNum = parseFloat(a.uid);
        const bNum = parseFloat(b.uid);
        if (!isNaN(aNum) && !isNaN(bNum)) return dir * (aNum - bNum);
        return dir * a.uid.localeCompare(b.uid);
      }
      case "join_date":
        return dir * (new Date(a.join_date).getTime() - new Date(b.join_date).getTime());
      case "time_in_clan_days":
        return dir * (a.time_in_clan_days - b.time_in_clan_days);
      case "status":
        // Active = 1, Inactive = 0 for ascending
        return dir * ((a.status === "active" ? 1 : 0) - (b.status === "active" ? 1 : 0));
      case "rank_current":
        return dir * ((RANK_ORDER[a.rank_current] ?? -1) - (RANK_ORDER[b.rank_current] ?? -1));
      case "rank_next": {
        const aRank = a.rank_next ? (RANK_ORDER[a.rank_next] ?? -1) : -2;
        const bRank = b.rank_next ? (RANK_ORDER[b.rank_next] ?? -1) : -2;
        return dir * (aRank - bRank);
      }
      case "days_until_next_rank": {
        // Convert special values: Ready=0, Paused/Max rank=Infinity
        const parseVal = (v: string | number): number => {
          if (typeof v === "number") return v;
          if (v === "Ready") return 0;
          if (v === "Paused" || v === "Max rank") return Infinity;
          const num = parseFloat(v);
          return isNaN(num) ? Infinity : num;
        };
        const aVal = parseVal(a.days_until_next_rank);
        const bVal = parseVal(b.days_until_next_rank);
        // For ascending, lower is better; Infinity goes last
        if (aVal === Infinity && bVal === Infinity) return 0;
        if (aVal === Infinity) return 1;
        if (bVal === Infinity) return -1;
        return dir * (aVal - bVal);
      }
      default:
        return 0;
    }
  });

  // ── Bulk resolve handler ────────────────────────────────
  const handleBulkResolve = async () => {
    setBulkResolving(true);
    setBulkResult(null);
    try {
      const res = await fetch("/.netlify/functions/clan-list-bulk-resolve", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setBulkResult(data?.error || "Bulk resolve failed.");
        return;
      }
      const debug = data?.debug;
      const debugText = debug
        ? ` UID-resolved: ${debug.uid_resolved}, name-resolved: ${debug.name_resolved}, uid-missing: ${debug.uid_missing}, uid-no-match: ${debug.uid_no_match}, guild-count: ${debug.guild_member_count}.`
        : "";
      setBulkResult(
        `Done! ${data.resolved} resolved, ${data.ambiguous} ambiguous, ${data.not_found} not found, ${data.skipped} skipped.${debugText}`
      );
      fetchMembers(page, debouncedSearch);
    } catch {
      setBulkResult("Network error during bulk resolve.");
    } finally {
      setBulkResolving(false);
    }
  };

  // ── Discord sync handler ────────────────────────────────
  const handleDiscordSync = async () => {
    setSyncLoading(true);
    setSyncResult(null);
    try {
      const res = await fetch("/.netlify/functions/clan-sync-discord", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncResult(data?.error || "Sync failed.");
        return;
      }
      setSyncResult(
        `Synced! ${data.checked_count} checked, ${data.still_in_guild_count} in guild, ${data.archived_left_guild_count} archived (left Discord).`
      );
      fetchMembers(page, debouncedSearch);
    } catch {
      setSyncResult("Network error during sync.");
    } finally {
      setSyncLoading(false);
    }
  };

  // ── Re-add archived member as new ───────────────────────
  const handleReaddMember = async (archivedMember: ClanMember) => {
    if (!confirm(`Re-add ${archivedMember.discord_name || archivedMember.ign} as a new member? They will start over from Private rank with 0 days.`)) {
      return;
    }
    try {
      const res = await fetch("/.netlify/functions/clan-list-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discord_name: archivedMember.discord_name,
          ign: archivedMember.ign,
          uid: archivedMember.uid,
          join_date: new Date().toISOString().split("T")[0],
          status: "active",
          has_420_tag: false,
          rank_current: "Private",
          source: "rejoin",
          discord_id: archivedMember.discord_id,
          allow_unresolved: !archivedMember.discord_id,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setUiError(result.error || "Failed to re-add member");
        return;
      }
      setShowArchived(false);
      fetchMembers(1, "");
      setPage(1);
      setSearch("");
      setDebouncedSearch("");
    } catch {
      setUiError("Network error while re-adding member.");
    }
  };

  // ── CSV upload handler ──────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array", cellDates: false });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        sheet,
        { raw: true }
      );

      if (jsonRows.length === 0) {
        setUploadError("The file contains no data rows.");
        return;
      }

      const res = await fetch("/.netlify/functions/clan-list-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: jsonRows }),
      });

      const result = await res.json();
      if (!res.ok) {
        setUploadError(result.error || "Upload failed");
        return;
      }

      setUploadResult(result);
      fetchMembers(1, debouncedSearch);
      setPage(1);
    } catch {
      setUploadError("Failed to read or upload the file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Add member ──────────────────────────────────────────
  const findDiscordCandidates = async () => {
    if (!addForm.discord_name.trim()) {
      setAddError("Discord name is required to resolve.");
      return;
    }

    setResolving(true);
    setAddError(null);
    setSaveUnresolvedAllowed(false);
    try {
      const q = encodeURIComponent(addForm.discord_name.trim());
      const res = await fetch(`/.netlify/functions/guild-member-search?q=${q}`);
      const data = await res.json();
      if (!res.ok) {
        setAddError(data?.error || "Failed to search Discord members.");
        return;
      }

      const candidates: ResolveCandidate[] = data?.candidates ?? [];
      setResolveCandidates(candidates);

      if (candidates.length === 1) {
        setAddForm((f) => ({
          ...f,
          resolve_token: candidates[0].resolve_token,
          discord_name: candidates[0].label || f.discord_name,
        }));
      }
    } catch {
      setAddError("Network error while searching Discord members.");
    } finally {
      setResolving(false);
    }
  };

  const handleAddMember = async (allowUnresolved = false) => {
    if (
      !addForm.discord_name ||
      !addForm.ign ||
      !addForm.uid ||
      !addForm.join_date
    ) {
      setAddError("All fields are required.");
      return;
    }
    setAddSaving(true);
    setAddError(null);
    try {
      const res = await fetch("/.netlify/functions/clan-list-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discord_name: addForm.discord_name,
          ign: addForm.ign,
          uid: addForm.uid,
          join_date: addForm.join_date,
          status: addForm.status,
          has_420_tag: addForm.has_420_tag,
          rank_current: addForm.rank_current,
          source: addForm.source,
          resolve_token: addForm.resolve_token || null,
          allow_unresolved: allowUnresolved,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        if (result?.code === "DISCORD_AMBIGUOUS") {
          const candidates: ResolveCandidate[] = result?.candidates ?? [];
          setResolveCandidates(candidates);
          setAddError("Multiple Discord matches found. Please choose one.");
          return;
        }
        if (result?.code === "DISCORD_NOT_FOUND") {
          setResolveCandidates([]);
          setSaveUnresolvedAllowed(true);
          setAddError("No Discord user found. You can still save this row as unresolved.");
          return;
        }
        setAddError(result.error || "Failed to add member");
        return;
      }
      setShowAddForm(false);
      setAddForm({
        discord_name: "",
        resolve_token: "",
        ign: "",
        uid: "",
        join_date: new Date().toISOString().split("T")[0],
        status: "active",
        has_420_tag: false,
        rank_current: "Private",
        source: "manual",
      });
      setResolveCandidates([]);
      setSaveUnresolvedAllowed(false);
      fetchMembers(page, debouncedSearch);
    } catch {
      setAddError("Network error");
    } finally {
      setAddSaving(false);
    }
  };

  // ── Inline update member field ──────────────────────────
  const updateMember = async (
    id: string,
    fields: Record<string, unknown>
  ) => {
    setSavingField(id);
    try {
      const res = await fetch("/.netlify/functions/clan-list-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...fields }),
      });
      if (res.ok) {
        const { member } = await res.json();
        setMembers((prev) =>
          prev.map((m) => (m.id === id ? { ...m, ...member } : m))
        );
      } else {
        const data = await res.json().catch(() => ({}));
        setUiError(data?.error || "Failed to update member.");
      }
    } catch {
      setUiError("Network error while updating member.");
    } finally {
      setSavingField(null);
    }
  };

  // ── Delete member ──────────────────────────────
  const deleteMember = async (id: string) => {
    if (!confirm("Remove this member from the clan list?")) return;
    setSavingField(id);
    try {
      const res = await fetch(
        `/.netlify/functions/clan-list-member-delete?id=${id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== id));
      } else {
        const data = await res.json().catch(() => ({}));
        setUiError(data?.error || "Failed to delete member.");
      }
    } catch {
      setUiError("Network error while deleting member.");
    } finally {
      setSavingField(null);
    }
  };

  // ── Inline discord_name editor ────────────────
  const startEditingName = (id: string, currentName: string) => {
    setEditingNameId(id);
    setEditingNameValue(currentName);
  };

  const saveEditingName = async (id: string) => {
    if (!editingNameValue.trim()) {
      setUiError("Discord name cannot be empty.");
      return;
    }
    const trimmedName = editingNameValue.trim();
    setEditingNameId(null);
    await updateMember(id, { discord_name: trimmedName });
  };

  const cancelEditingName = () => {
    setEditingNameId(null);
    setEditingNameValue("");
  };

  const searchResolveCandidates = async (query: string) => {
    if (!query.trim()) {
      setResolveError("Discord name is required to search.");
      return;
    }
    setResolveLoading(true);
    setResolveError(null);
    try {
      const q = encodeURIComponent(query.trim());
      const res = await fetch(`/.netlify/functions/guild-member-search?q=${q}`);
      const data = await res.json();
      if (!res.ok) {
        setResolveError(data?.error || "Failed to search Discord members.");
        return;
      }
      const candidates: ResolveCandidate[] = data?.candidates ?? [];
      setResolveTargetCandidates(candidates);
      if (candidates.length === 1) {
        setResolveTargetToken(candidates[0].resolve_token);
      }
      if (candidates.length === 0) {
        setResolveError("No Discord user found for this name.");
      }
    } catch {
      setResolveError("Network error while searching Discord members.");
    } finally {
      setResolveLoading(false);
    }
  };

  const openResolveForMember = async (memberId: string, discordName: string) => {
    setResolveTargetId(memberId);
    setResolveQuery(discordName);
    setResolveTargetToken("");
    setResolveTargetCandidates([]);
    setResolveError(null);
    await searchResolveCandidates(discordName);
  };

  const applyResolveForMember = async () => {
    if (!resolveTargetId || !resolveTargetToken) {
      setResolveError("Select a Discord match first.");
      return;
    }
    setResolveSaving(true);
    setResolveError(null);
    try {
      const res = await fetch("/.netlify/functions/clan-member-resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_row_id: resolveTargetId,
          resolve_token: resolveTargetToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResolveError(data?.error || "Failed to resolve member.");
        return;
      }

      setMembers((prev) =>
        prev.map((m) =>
          m.id === resolveTargetId
            ? {
                ...m,
                needs_resolution: false,
              }
            : m
        )
      );

      setResolveTargetId(null);
      setResolveQuery("");
      setResolveTargetToken("");
      setResolveTargetCandidates([]);
      setResolveError(null);
      fetchMembers(page, debouncedSearch);
    } catch {
      setResolveError("Network error while resolving member.");
    } finally {
      setResolveSaving(false);
    }
  };

  // ── Preview promotions ──────────────────────────────────
  const previewPromotions = async () => {
    setPromoLoading(true);
    setPromoResult(null);
    try {
      const res = await fetch("/.netlify/functions/clan-promotions-preview", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setUiError(data?.error || "Failed to load promotion preview.");
        return;
      }
      setPromoPreview(data);
    } catch {
      setPromoResult("Failed to load preview.");
    } finally {
      setPromoLoading(false);
    }
  };

  // ── Run promotions ──────────────────────────────────────
  const runPromotions = async (force = false) => {
    setPromoRunning(true);
    setPromoResult(null);
    setShowForceConfirm(false);
    try {
      const res = await fetch("/.netlify/functions/clan-promotions-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!data.ok && data.message) {
        setPromoResult(data.message);
      } else if (!res.ok) {
        setUiError(data?.error || "Failed to run promotions.");
      } else if (data.ok) {
        setPromoResult(
          `Done! ${data.executed} promoted, ${data.failed} failed, ${data.skipped_unresolved} skipped (unresolved).${
            data.announcement_posted ? " Announcement posted!" : ""
          }`
        );
        fetchMembers(page, debouncedSearch);
        setPromoPreview(null);
      }
    } catch {
      setPromoResult("Network error.");
    } finally {
      setPromoRunning(false);
    }
  };

  // ── Manual promotion ────────────────────────────────────
  const runManualPromotion = async () => {
    if (!manualPromoMemberId || !manualPromoNewRank) {
      setManualPromoResult("Please select a member and rank.");
      return;
    }
    setManualPromoRunning(true);
    setManualPromoResult(null);
    try {
      const res = await fetch("/.netlify/functions/clan-member-force-promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: manualPromoMemberId,
          new_rank: manualPromoNewRank,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setManualPromoResult(data?.error || "Manual promotion failed.");
      } else {
        setManualPromoResult(
          `Success! Promoted to ${manualPromoNewRank}. ${data.role_updated ? "Role updated." : "Role update failed."}`
        );
        fetchMembers(page, debouncedSearch);
        setManualPromoMemberId(null);
        setManualPromoNewRank("");
      }
    } catch {
      setManualPromoResult("Network error.");
    } finally {
      setManualPromoRunning(false);
    }
  };

  // ── Guards ──────────────────────────────────────────────
  if (!authLoading && (!user || !user.is_staff)) {
    return <Navigate to="/pack" replace />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-secondary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top bar ─────────────────────────────────────── */}
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
        className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-secondary/30 shadow-lg"
      >
        <div className="container mx-auto px-4 flex items-center justify-between h-16">
          <Link
            to="/pack"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <img
              src={clanLogo}
              alt="420 Clan Logo"
              className="w-8 h-8 rounded-full"
            />
            <span className="font-display text-sm font-bold hidden sm:block">
              Back to homepage
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-secondary" />
            <span className="font-display text-lg font-bold text-secondary hidden sm:block">
              Clan List
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Navigation to Admin Panel */}
            <Link
              to="/admin"
              className="px-3 py-1.5 text-sm font-display font-bold bg-secondary/20 hover:bg-secondary/30 text-secondary rounded-lg transition border border-secondary/30 hidden sm:block"
              title="Go to Applications"
            >
              Applications
            </Link>
            <Link
              to="/admin"
              className="px-2 py-1.5 text-secondary hover:bg-secondary/20 rounded transition sm:hidden"
              title="Applications"
            >
              <Shield className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              {user!.avatar && (
                <img
                  src={user!.avatar}
                  alt=""
                  className="w-8 h-8 rounded-full border border-border"
                />
              )}
              <span className="text-sm text-foreground hidden sm:block">
                {user!.username}
              </span>
            </div>
            <a
              href="/.netlify/functions/logout"
              className="text-muted-foreground hover:text-destructive transition"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </a>
          </div>
        </div>
      </motion.nav>

      {/* ── Content ─────────────────────────────────────── */}
      <div className="container mx-auto px-4 max-w-7xl py-6 space-y-6">
        {uiError && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-3 flex items-center justify-between gap-3">
            <span>{uiError}</span>
            <button
              onClick={() => setUiError(null)}
              className="text-destructive hover:opacity-80"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Import + Add Member buttons ── */}
        <div className="flex flex-wrap gap-3 items-center">
          <label className="inline-flex items-center gap-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground font-display font-bold px-5 py-2.5 rounded-lg transition cursor-pointer">
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {uploading ? "Importing..." : "Import CSV"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex items-center gap-2 border border-secondary/40 text-secondary hover:bg-secondary/10 font-display font-bold px-5 py-2.5 rounded-lg transition"
          >
            <Plus className="w-4 h-4" />
            Add Member
          </button>
          <div className="flex-1" />
          <div className="flex gap-3 text-xs text-muted-foreground font-display">
            <span>
              {total} member{total !== 1 ? "s" : ""}
            </span>
            {promoDueCount > 0 && (
              <span className="text-green-400">
                <Zap className="w-3 h-3 inline mr-0.5" />
                {promoDueCount} promo ready
              </span>
            )}
            {unresolvedCount > 0 && (
              <span className="text-yellow-400">
                <AlertTriangle className="w-3 h-3 inline mr-0.5" />
                {unresolvedCount} unresolved
              </span>
            )}
            {archivedCount > 0 && (
              <span className="text-red-400">
                <Users className="w-3 h-3 inline mr-0.5" />
                {archivedCount} archived
              </span>
            )}
          </div>
        </div>

        {/* ── Discord Sync + Bulk resolve + Show Archived ── */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleDiscordSync}
            disabled={syncLoading || showArchived}
            className="inline-flex items-center gap-2 border border-blue-400/40 text-blue-400 hover:bg-blue-400/10 font-display font-bold px-5 py-2.5 rounded-lg transition disabled:opacity-50"
            title="Check Discord membership and archive members who left"
          >
            {syncLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Users className="w-4 h-4" />
            )}
            {syncLoading ? "Syncing..." : "Refresh Discord Sync"}
          </button>
          {syncResult && (
            <span className="text-xs text-muted-foreground">{syncResult}</span>
          )}
          <button
            onClick={() => {
              setShowArchived((v) => !v);
              setPage(1);
            }}
            className={`inline-flex items-center gap-2 border font-display font-bold px-5 py-2.5 rounded-lg transition ${
              showArchived
                ? "border-red-400 text-red-400 bg-red-400/10"
                : "border-muted-foreground/40 text-muted-foreground hover:bg-muted-foreground/10"
            }`}
          >
            {showArchived ? <Check className="w-4 h-4" /> : <Users className="w-4 h-4" />}
            {showArchived ? "Showing Archived" : "Show Archived"}
          </button>
        </div>

        {/* ── Bulk resolve ── */}
        {unresolvedCount > 0 && !showArchived && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleBulkResolve}
              disabled={bulkResolving}
              className="inline-flex items-center gap-2 border border-yellow-400/40 text-yellow-400 hover:bg-yellow-400/10 font-display font-bold px-5 py-2.5 rounded-lg transition disabled:opacity-50"
            >
              {bulkResolving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {bulkResolving ? "Resolving..." : "Bulk Resolve Unresolved"}
            </button>
            {bulkResult && (
              <span className="text-xs text-muted-foreground">{bulkResult}</span>
            )}
          </div>
        )}

        {resolveTargetId && (
          <div className="bg-card border border-yellow-400/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display font-bold text-yellow-400 text-sm">
                Resolve Unresolved Member
              </h3>
              <button
                onClick={() => {
                  setResolveTargetId(null);
                  setResolveTargetCandidates([]);
                  setResolveTargetToken("");
                  setResolveError(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={resolveQuery}
                onChange={(e) => setResolveQuery(e.target.value)}
                className="flex-1 min-w-[220px] bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-secondary/50 focus:outline-none"
                placeholder="Search Discord name"
              />
              <button
                onClick={() => searchResolveCandidates(resolveQuery)}
                disabled={resolveLoading || !resolveQuery.trim()}
                className="inline-flex items-center gap-2 border border-secondary/40 text-secondary hover:bg-secondary/10 font-display font-bold px-4 py-2 rounded-lg transition disabled:opacity-50"
              >
                {resolveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Find
              </button>
            </div>

            {resolveTargetCandidates.length > 0 && (
              <select
                value={resolveTargetToken}
                onChange={(e) => setResolveTargetToken(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-secondary/50 focus:outline-none"
              >
                <option value="">Choose a Discord user...</option>
                {resolveTargetCandidates.map((c, i) => (
                  <option key={i} value={c.resolve_token}>
                    {c.label} {c.sublabel}
                  </option>
                ))}
              </select>
            )}

            {resolveError && <p className="text-sm text-destructive">{resolveError}</p>}

            <div className="flex items-center gap-2">
              <button
                onClick={applyResolveForMember}
                disabled={resolveSaving || !resolveTargetToken}
                className="inline-flex items-center gap-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground font-display font-bold px-4 py-2 rounded-lg transition disabled:opacity-50"
              >
                {resolveSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Resolve
              </button>
            </div>
          </div>
        )}

        {/* ── Upload result ── */}
        {uploadError && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-3">
            {uploadError}
          </div>
        )}
        {uploadResult && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-lg px-4 py-3">
            Import complete: {uploadResult.imported} imported,{" "}
            {uploadResult.updated} updated, {uploadResult.unresolved}{" "}
            unresolved.
            {uploadResult.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs">
                  {uploadResult.errors.length} error(s)
                </summary>
                <ul className="mt-1 text-xs space-y-0.5">
                  {uploadResult.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* ── Add member form ── */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-card border border-secondary/30 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-secondary text-sm">
                    Add New Member
                  </h3>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Discord Name *
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={addForm.discord_name}
                        onChange={(e) =>
                          setAddForm((f) => ({
                            ...f,
                            discord_name: e.target.value,
                            resolve_token: "",
                          }))
                        }
                        onBlur={findDiscordCandidates}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-secondary/50 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={findDiscordCandidates}
                        disabled={resolving || !addForm.discord_name.trim()}
                        className="px-3 py-2 rounded-lg border border-secondary/40 text-secondary hover:bg-secondary/10 text-xs font-display font-bold disabled:opacity-50"
                      >
                        {resolving ? "..." : "Find"}
                      </button>
                    </div>
                    {addForm.resolve_token && (
                      <p className="text-xs text-green-400 mt-1">
                        Resolved
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      IGN *
                    </label>
                    <input
                      value={addForm.ign}
                      onChange={(e) =>
                        setAddForm((f) => ({ ...f, ign: e.target.value }))
                      }
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-secondary/50 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      UID *
                    </label>
                    <input
                      value={addForm.uid}
                      onChange={(e) =>
                        setAddForm((f) => ({ ...f, uid: e.target.value }))
                      }
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-secondary/50 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Join Date *
                    </label>
                    <input
                      type="date"
                      value={addForm.join_date}
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          join_date: e.target.value,
                        }))
                      }
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-secondary/50 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Status
                    </label>
                    <select
                      value={addForm.status}
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          status: e.target.value as "active" | "inactive",
                        }))
                      }
                      className="w-full bg-muted border border-border rounded-lg pl-3 pr-10 py-2 text-sm text-foreground focus:ring-2 focus:ring-secondary/50 focus:outline-none"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Rank
                    </label>
                    <select
                      value={addForm.rank_current}
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          rank_current: e.target.value,
                        }))
                      }
                      className="w-full bg-muted border border-border rounded-lg pl-3 pr-10 py-2 text-sm text-foreground focus:ring-2 focus:ring-secondary/50 focus:outline-none"
                    >
                      {RANKS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={addForm.has_420_tag}
                        onChange={(e) =>
                          setAddForm((f) => ({
                            ...f,
                            has_420_tag: e.target.checked,
                          }))
                        }
                        className="accent-secondary w-4 h-4 rounded"
                      />
                      Has 420 Tag
                    </label>
                  </div>
                </div>
                {resolveCandidates.length > 1 && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Select Discord Match
                    </label>
                    <select
                      value={addForm.resolve_token}
                      onChange={(e) => {
                        const selected = resolveCandidates.find(
                          (c) => c.resolve_token === e.target.value
                        );
                        setAddForm((f) => ({
                          ...f,
                          resolve_token: e.target.value,
                          discord_name: selected?.label || f.discord_name,
                        }));
                      }}
                      className="w-full bg-muted border border-border rounded-lg pl-3 pr-10 py-2 text-sm text-foreground focus:ring-2 focus:ring-secondary/50 focus:outline-none"
                    >
                      <option value="">Choose a Discord user...</option>
                      {resolveCandidates.map((c, i) => (
                        <option key={i} value={c.resolve_token}>
                          {c.label} {c.sublabel}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {addError && (
                  <p className="text-sm text-destructive">{addError}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleAddMember(false)}
                    disabled={addSaving}
                    className="inline-flex items-center gap-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground font-display font-bold px-5 py-2 rounded-lg transition disabled:opacity-50"
                  >
                    {addSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save Member
                  </button>
                  {saveUnresolvedAllowed && (
                    <button
                      onClick={() => handleAddMember(true)}
                      disabled={addSaving}
                      className="inline-flex items-center gap-2 border border-yellow-400/40 text-yellow-400 hover:bg-yellow-400/10 font-display font-bold px-5 py-2 rounded-lg transition disabled:opacity-50"
                    >
                      Save as Unresolved
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Search + filters ── */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative w-full sm:w-auto sm:min-w-[220px] sm:max-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              placeholder="Search by name, IGN, or UID..."
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border transition"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="flex-1 sm:flex-none sm:w-[130px] bg-muted border border-border rounded-lg pl-3 pr-10 py-2.5 text-sm text-foreground focus:outline-none"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            value={tagFilter}
            onChange={(e) => {
              setTagFilter(e.target.value);
              setPage(1);
            }}
            className="flex-1 sm:flex-none sm:w-[130px] bg-muted border border-border rounded-lg pl-3 pr-10 py-2.5 text-sm text-foreground focus:outline-none"
          >
            <option value="">All Tags</option>
            <option value="true">Has 420 Tag</option>
            <option value="false">No 420 Tag</option>
          </select>
          <select
            value={promoFilter}
            onChange={(e) => {
              setPromoFilter(e.target.value);
              setPage(1);
            }}
            className="flex-1 sm:flex-none sm:w-[145px] bg-muted border border-border rounded-lg pl-3 pr-10 py-2.5 text-sm text-foreground focus:outline-none"
          >
            <option value="">All Promotion</option>
            <option value="true">Promotion Due</option>
            <option value="false">No Promotion</option>
          </select>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 text-secondary hover:text-secondary/80 text-sm font-display font-bold transition hover:underline"
            >
              <FilterX className="w-4 h-4" />
              Clear filters
            </button>
          )}
        </div>

        {/* ── Mobile sort controls ── */}
        <div className="lg:hidden flex flex-wrap gap-3 items-center">
          <select
            value={sortKey ?? ""}
            onChange={(e) => {
              const val = e.target.value as SortKey | "";
              if (val === "") {
                setSortKey(null);
              } else {
                handleSort(val);
              }
            }}
            className="flex-1 bg-muted border border-border rounded-lg pl-3 pr-10 py-2.5 text-sm text-foreground focus:outline-none"
          >
            <option value="">Sort by...</option>
            <option value="discord_name">Discord Name</option>
            <option value="ign">IGN</option>
            <option value="join_date">Join Date</option>
            <option value="time_in_clan_days">Days in Clan</option>
            <option value="rank_current">Rank</option>
            <option value="days_until_next_rank">Days Until Next</option>
          </select>
          {sortKey && (
            <button
              onClick={() => setSortDirection((d) => (d === "asc" ? "desc" : "asc"))}
              className="inline-flex items-center gap-1.5 bg-secondary/20 hover:bg-secondary/30 text-secondary px-3 py-2.5 rounded-lg text-sm font-display font-bold transition"
            >
              {sortDirection === "asc" ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              {sortDirection === "asc" ? "Ascending" : "Descending"}
            </button>
          )}
        </div>

        {/* ── Table (desktop) / Card view (mobile) ── */}
        {membersLoading && (
          <div className="text-center py-12">
            <Loader2 className="w-6 h-6 text-secondary animate-spin mx-auto" />
          </div>
        )}

        {!membersLoading && members.length === 0 && (
          <p className="text-center text-muted-foreground py-12">
            {debouncedSearch
              ? "No members match your search."
              : "No members yet. Import a CSV or add manually."}
          </p>
        )}

        {!membersLoading && members.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto rounded-lg border border-secondary/20">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/10 border-b border-secondary/20">
                    {([
                      { label: "Discord Name", key: "discord_name" as SortKey },
                      { label: "IGN", key: "ign" as SortKey },
                      { label: "UID", key: "uid" as SortKey },
                      { label: "Join Date", key: "join_date" as SortKey },
                      { label: "Days", key: "time_in_clan_days" as SortKey },
                      { label: "420 Tag", key: null },
                      { label: "Status", key: "status" as SortKey },
                      { label: "Rank", key: "rank_current" as SortKey },
                      { label: "Next Rank", key: "rank_next" as SortKey },
                      { label: "Until Next", key: "days_until_next_rank" as SortKey },
                      { label: "Info", key: null },
                    ] as { label: string; key: SortKey | null }[]).map((col) => {
                      const isSortable = col.key !== null;
                      const isActive = sortKey === col.key;
                      return (
                        <th
                          key={col.label}
                          onClick={() => isSortable && col.key && handleSort(col.key)}
                          className={`font-display font-bold px-3 py-3 text-xs uppercase tracking-wider whitespace-nowrap ${
                            col.label === "420 Tag" || col.label === "Info"
                              ? "text-center"
                              : "text-left"
                          } ${
                            isSortable
                              ? "cursor-pointer hover:bg-secondary/20 transition select-none"
                              : ""
                          } ${
                            isActive ? "text-primary bg-secondary/15" : "text-secondary"
                          }`}
                          style={col.label === "Until Next" ? { textAlign: "center" } : undefined}
                        >
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                            {isSortable && (
                              isActive ? (
                                sortDirection === "asc" ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )
                              ) : (
                                <ArrowUpDown className="w-3 h-3 opacity-40" />
                              )
                            )}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.map((m, i) => (
                    <tr
                      key={m.id}
                      className={`border-b border-border/50 ${
                        m.archived_at
                          ? "bg-red-950/20 opacity-60"
                          : i % 2 === 0
                          ? "bg-card"
                          : "bg-muted/30"
                      } hover:bg-secondary/5 transition ${
                        m.promote_eligible && !m.archived_at ? "ring-1 ring-green-500/30" : ""
                      }`}
                    >
                      <td className="px-3 py-2.5 text-foreground whitespace-nowrap max-w-[160px]">
                        {editingNameId === m.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editingNameValue}
                              onChange={(e) => setEditingNameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEditingName(m.id);
                                if (e.key === "Escape") cancelEditingName();
                              }}
                              className="bg-muted border border-secondary/50 rounded px-2 py-0.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-secondary"
                              autoFocus
                            />
                            <button
                              onClick={() => saveEditingName(m.id)}
                              className="text-green-400 hover:text-green-300 transition p-0.5"
                              title="Save"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={cancelEditingName}
                              className="text-red-400 hover:text-red-300 transition p-0.5"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div
                            className="truncate cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition"
                            onClick={() => startEditingName(m.id, m.discord_name)}
                            title="Click to edit Discord name"
                          >
                            {m.discord_name}
                            {m.needs_resolution && (
                              <AlertTriangle
                                className="w-3 h-3 text-yellow-400 inline ml-1"
                                title="Needs Discord ID resolution"
                              />
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-foreground whitespace-nowrap">
                        {m.ign}
                      </td>
                      <td className="px-3 py-2.5 text-foreground whitespace-nowrap font-mono text-xs">
                        {m.uid}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap text-xs">
                        {new Date(m.join_date).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2.5 text-foreground whitespace-nowrap font-mono">
                        {m.time_in_clan_days}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={m.has_420_tag}
                          onChange={(e) =>
                            updateMember(m.id, {
                              has_420_tag: e.target.checked,
                            })
                          }
                          disabled={savingField === m.id}
                          className="accent-secondary w-4 h-4 rounded cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <select
                          value={m.status}
                          onChange={(e) =>
                            updateMember(m.id, { status: e.target.value })
                          }
                          disabled={savingField === m.id}
                          className={`bg-transparent border border-border/50 rounded pl-2 pr-8 py-1 text-xs font-display font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-secondary/50 ${
                            m.status === "active"
                              ? "text-green-400"
                              : "text-red-400"
                          }`}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-display text-xs font-bold text-secondary">
                          {m.rank_current}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {m.rank_next && m.rank_current !== "Major" ? (
                          <span
                            className={`font-display text-xs font-bold ${
                              m.promote_eligible
                                ? "text-green-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            {m.rank_next}
                            {m.promote_eligible && (
                              <Zap className="w-3 h-3 inline ml-1" />
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        {typeof m.days_until_next_rank === "number" ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            {m.days_until_next_rank}d
                          </span>
                        ) : m.days_until_next_rank === "Ready" ? (
                          <span className="text-xs font-bold text-green-400">Ready</span>
                        ) : m.days_until_next_rank === "Paused" ? (
                          <span className="text-xs text-yellow-400">Paused</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">{m.days_until_next_rank}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {savingField === m.id ? (
                          <Loader2 className="w-3 h-3 animate-spin text-secondary mx-auto" />
                        ) : m.archived_at ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <span
                              className="text-xs text-red-400 cursor-help"
                              title={`Archived ${new Date(m.archived_at).toLocaleDateString()}${m.archive_reason ? ` - ${m.archive_reason}` : ""}${m.left_guild_at ? ` (Left guild ${new Date(m.left_guild_at).toLocaleDateString()})` : ""}`}
                            >
                              Archived
                            </span>
                            <button
                              onClick={() => handleReaddMember(m)}
                              className="text-green-400 hover:text-green-300 transition p-0.5"
                              title="Re-add as new member (starts over)"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            {m.promote_reason && (
                              <span
                                className="text-xs text-green-400 cursor-help"
                                title={m.promote_reason}
                              >
                                <Check className="w-3 h-3 inline" />
                              </span>
                            )}
                            {m.needs_resolution && (
                              <button
                                onClick={() => openResolveForMember(m.id, m.discord_name)}
                                className="text-yellow-400 hover:text-yellow-300 transition p-0.5"
                                title="Resolve member"
                              >
                                <Search className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => deleteMember(m.id)}
                              className="text-red-400 hover:text-red-300 transition p-0.5"
                              title="Delete member"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card view */}
            <div className="lg:hidden space-y-3">
              {sortedMembers.map((m) => (
                <div
                  key={m.id}
                  className={`bg-card border rounded-lg p-4 space-y-2 ${
                    m.archived_at
                      ? "border-red-500/40 opacity-60"
                      : m.promote_eligible
                      ? "border-green-500/40"
                      : "border-secondary/20"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      {editingNameId === m.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editingNameValue}
                            onChange={(e) => setEditingNameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEditingName(m.id);
                              if (e.key === "Escape") cancelEditingName();
                            }}
                            className="bg-muted border border-secondary/50 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-secondary"
                            autoFocus
                          />
                          <button
                            onClick={() => saveEditingName(m.id)}
                            className="text-green-400 hover:text-green-300 transition p-1"
                            title="Save"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={cancelEditingName}
                            className="text-red-400 hover:text-red-300 transition p-1"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <p
                          className="font-display font-bold text-sm text-foreground truncate cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition"
                          onClick={() => startEditingName(m.id, m.discord_name)}
                          title="Click to edit Discord name"
                        >
                          {m.discord_name}
                          {m.needs_resolution && (
                            <AlertTriangle className="w-3 h-3 text-yellow-400 inline ml-1" />
                          )}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {m.ign} · UID: {m.uid}
                      </p>
                    </div>
                    <span className="font-display text-xs font-bold text-secondary shrink-0 ml-2">
                      {m.rank_current}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Joined {new Date(m.join_date).toLocaleDateString()}
                    </span>
                    <span className="font-mono">
                      {m.time_in_clan_days} days
                    </span>
                    {m.promote_eligible && m.rank_next && (
                      <span className="text-green-400 font-bold">
                        <Zap className="w-3 h-3 inline mr-0.5" />→ {m.rank_next}
                      </span>
                    )}
                    <span className={`font-mono ${
                      m.days_until_next_rank === "Ready" ? "text-green-400 font-bold" :
                      m.days_until_next_rank === "Paused" ? "text-yellow-400" :
                      m.days_until_next_rank === "Max rank" ? "text-muted-foreground/50" :
                      "text-muted-foreground"
                    }`}>
                      {typeof m.days_until_next_rank === "number"
                        ? `${m.days_until_next_rank}d to next`
                        : m.days_until_next_rank}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    {m.archived_at ? (
                      <>
                        <span
                          className="text-xs text-red-400 cursor-help"
                          title={`Archived ${new Date(m.archived_at).toLocaleDateString()}${m.archive_reason ? ` - ${m.archive_reason}` : ""}${m.left_guild_at ? ` (Left guild ${new Date(m.left_guild_at).toLocaleDateString()})` : ""}`}
                        >
                          Archived
                        </span>
                        <button
                          onClick={() => handleReaddMember(m)}
                          className="text-xs border border-green-400/40 text-green-400 hover:bg-green-400/10 px-2 py-1 rounded font-display font-bold flex items-center gap-1"
                        >
                          <UserPlus className="w-3 h-3" />
                          Re-add
                        </button>
                      </>
                    ) : (
                      <>
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={m.has_420_tag}
                            onChange={(e) =>
                              updateMember(m.id, {
                                has_420_tag: e.target.checked,
                              })
                            }
                            disabled={savingField === m.id}
                            className="accent-secondary w-3.5 h-3.5 rounded"
                          />
                          420 Tag
                        </label>
                        <select
                          value={m.status}
                          onChange={(e) =>
                            updateMember(m.id, { status: e.target.value })
                          }
                          disabled={savingField === m.id}
                          className={`bg-transparent border border-border/50 rounded pl-2 pr-8 py-0.5 text-xs font-display font-bold cursor-pointer focus:outline-none ${
                            m.status === "active"
                              ? "text-green-400"
                              : "text-red-400"
                          }`}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                        {savingField === m.id && (
                          <Loader2 className="w-3 h-3 animate-spin text-secondary" />
                        )}
                        {m.needs_resolution && (
                          <button
                            onClick={() => openResolveForMember(m.id, m.discord_name)}
                            className="text-xs border border-yellow-400/40 text-yellow-400 hover:bg-yellow-400/10 px-2 py-1 rounded font-display font-bold"
                          >
                            Resolve
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 pt-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <span className="text-sm text-muted-foreground font-display">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition disabled:opacity-30"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Promotions section ── */}
        <div className="border-t border-secondary/20 pt-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-secondary flex items-center gap-2">
            <Zap className="w-5 h-5" /> Promotions
          </h2>

          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={previewPromotions}
              disabled={promoLoading}
              className="inline-flex items-center gap-2 border border-secondary/40 text-secondary hover:bg-secondary/10 font-display font-bold px-5 py-2.5 rounded-lg transition disabled:opacity-50"
            >
              {promoLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Preview Promotions
            </button>

            {promoPreview && promoPreview.threshold_met && (
              <button
                onClick={() => runPromotions(false)}
                disabled={promoRunning}
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-display font-bold px-5 py-2.5 rounded-lg transition disabled:opacity-50"
              >
                {promoRunning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                Run Promotions
              </button>
            )}

            {promoPreview &&
              !promoPreview.threshold_met &&
              promoPreview.total_due > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-yellow-400 font-display">
                    {promoPreview.total_due} promotion
                    {promoPreview.total_due !== 1 ? "s" : ""} ready, waiting for
                    5+ threshold
                  </span>
                  {!showForceConfirm ? (
                    <button
                      onClick={() => setShowForceConfirm(true)}
                      className="text-xs border border-yellow-400/40 text-yellow-400 hover:bg-yellow-400/10 px-3 py-1.5 rounded-lg font-display font-bold transition"
                    >
                      Force Run
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-destructive">
                        Are you sure?
                      </span>
                      <button
                        onClick={() => runPromotions(true)}
                        disabled={promoRunning}
                        className="text-xs bg-destructive text-destructive-foreground px-3 py-1.5 rounded-lg font-display font-bold transition disabled:opacity-50"
                      >
                        {promoRunning ? "Running..." : "Confirm"}
                      </button>
                      <button
                        onClick={() => setShowForceConfirm(false)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
          </div>

          {promoResult && (
            <div className="bg-secondary/10 border border-secondary/30 text-secondary text-sm rounded-lg px-4 py-3">
              {promoResult}
            </div>
          )}

          {/* Preview table */}
          {promoPreview && promoPreview.promotions.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-display text-sm font-bold text-foreground">
                Eligible Members ({promoPreview.total_due})
              </h3>
              <div className="overflow-x-auto rounded-lg border border-secondary/20">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary/10 border-b border-secondary/20">
                      {["Name", "IGN", "Days", "From", "To", "Status"].map(
                        (h) => (
                          <th
                            key={h}
                            className={`font-display font-bold text-secondary px-3 py-2 text-xs uppercase ${
                              h === "Status" ? "text-center" : "text-left"
                            }`}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {promoPreview.promotions.map((p) => (
                      <tr
                        key={p.member_id}
                        className="border-b border-border/50 hover:bg-secondary/5"
                      >
                        <td className="px-3 py-2 text-foreground">
                          {p.discord_name}
                        </td>
                        <td className="px-3 py-2 text-foreground">{p.ign}</td>
                        <td className="px-3 py-2 font-mono">
                          {p.time_in_clan_days}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {p.from_rank}
                        </td>
                        <td className="px-3 py-2 text-green-400 font-bold">
                          {p.to_rank}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {p.needs_resolution ? (
                            <span
                              className="text-yellow-400 text-xs"
                              title="No Discord ID — will be skipped"
                            >
                              <AlertTriangle className="w-3 h-3 inline" />{" "}
                              Unresolved
                            </span>
                          ) : (
                            <span className="text-green-400 text-xs">
                              <Check className="w-3 h-3 inline" /> Ready
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Unresolved members */}
          {promoPreview && promoPreview.unresolved.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-display text-sm font-bold text-yellow-400 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> Unresolved Members (
                {promoPreview.unresolved.length})
              </h3>
              <p className="text-xs text-muted-foreground">
                These members have no Discord ID linked and will be skipped
                during promotion. Bot cannot change roles without a Discord ID.
              </p>
              <div className="space-y-1">
                {promoPreview.unresolved.map((u) => (
                  <div
                    key={u.member_id}
                    className="text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded"
                  >
                    <span className="text-foreground font-bold">
                      {u.discord_name}
                    </span>{" "}
                    — {u.ign} (UID: {u.uid}) — {u.from_rank} → {u.to_rank}
                  </div>
                ))}
              </div>
            </div>
          )}

          {promoPreview && promoPreview.promotions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No members are currently eligible for promotion.
            </p>
          )}
        </div>

        {/* ── Manual Promotion section ── */}
        <div className="border-t border-secondary/20 pt-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-secondary flex items-center gap-2">
            <Zap className="w-5 h-5" /> Manual Promotion
          </h2>
          <p className="text-sm text-muted-foreground">
            Force promote a specific member to any rank, bypassing eligibility checks.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-display font-bold text-muted-foreground mb-1.5">
                Select Member
              </label>
              <select
                value={manualPromoMemberId ?? ""}
                onChange={(e) => setManualPromoMemberId(e.target.value || null)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-secondary/50 focus:outline-none"
              >
                <option value="">-- Choose member --</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.discord_name} ({m.ign}) - Current: {m.rank_current}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-display font-bold text-muted-foreground mb-1.5">
                New Rank
              </label>
              <select
                value={manualPromoNewRank}
                onChange={(e) => setManualPromoNewRank(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-secondary/50 focus:outline-none"
              >
                <option value="">-- Choose rank --</option>
                {RANKS.map((rank) => (
                  <option key={rank} value={rank}>
                    {rank}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={runManualPromotion}
                disabled={manualPromoRunning || !manualPromoMemberId || !manualPromoNewRank}
                className="w-full inline-flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground font-display font-bold px-5 py-2 rounded-lg transition disabled:opacity-50"
              >
                {manualPromoRunning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                Force Promote
              </button>
            </div>
          </div>

          {manualPromoResult && (
            <div className={`border rounded-lg px-4 py-3 text-sm ${
              manualPromoResult.includes("Success") 
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : "bg-red-500/10 border-red-500/30 text-red-400"
            }`}>
              {manualPromoResult}
            </div>
          )}
        </div>

        {/* Queued Promotion Management Section */}
        <PromotionQueueSection />
      </div>
    </div>
  );
};

export default ClanListPage;
