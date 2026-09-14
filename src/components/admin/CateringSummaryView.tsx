import React, { useEffect, useMemo, useState } from 'react';
import { Guest, FloorMapData } from '../../types';
import { Utensils, Printer, AlertTriangle, CheckCircle2, Users, FileSpreadsheet, ArrowUpDown, ChevronUp, ChevronDown, BarChart3 } from 'lucide-react';
import { useToast } from '../shared/ToastContext';
import { useT, useTf } from '../shared/i18n';
import { usePrint } from '../shared/hooks';
import { SearchInput } from '../shared/ui';
import { getAttendeeLocations } from '../../lib/tableAssignment';
import { getPartyMembers } from '../../lib/guestAttendees';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  createColumnHelper,
  flexRender,
  SortingState,
} from '@tanstack/react-table';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface CateringSummaryViewProps {
  guests: Guest[];
}

const partySize = (g: Guest) => g.attending_party_size || 1;

const hasDietaryRestriction = (g: Guest) => {
  const r = (g.dietary_restrictions || '').trim().toLowerCase();
  return r.length > 0 && r !== 'none';
};

interface CateringRow {
  id: string;
  guest: Guest;
  name: string;
  tableName: string | null;
  seatNumber: number | null;
}

const columnHelper = createColumnHelper<CateringRow>();

export const CateringSummaryView: React.FC<CateringSummaryViewProps> = ({ guests }) => {
    const t = useT();
    const tf = useTf();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDietaryOnly, setFilterDietaryOnly] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [floorMap, setFloorMap] = useState<FloorMapData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/floorplan')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setFloorMap(d.floorMap ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Filter attending guests only for catering
  const attendingGuests = useMemo(
    () => guests.filter((g) => g.rsvp_status === 'Attending'),
    [guests]
  );
  const totalHeadcount = useMemo(
    () => attendingGuests.reduce((acc, g) => acc + partySize(g), 0),
    [attendingGuests]
  );

  // One row per individual person, each with their group's code and own table/seat.
  const individuals: CateringRow[] = useMemo(
    () =>
      attendingGuests.flatMap((g) => {
        const names = getPartyMembers(g);
        const locations = getAttendeeLocations(g.id, floorMap, guests);
        return names.map((name, i) => {
          const loc = locations.find((l) => l.attendeeIndex === i) ?? null;
          return {
            id: `${g.id}:${i}`,
            guest: g,
            name,
            tableName: loc?.tableName ?? null,
            seatNumber: loc ? loc.seatIndex + 1 : null,
          };
        });
      }),
    [attendingGuests, floorMap, guests]
  );

  // Analyze Dietary Restrictions
  const guestsWithDietary = useMemo(
    () => attendingGuests.filter(hasDietaryRestriction),
    [attendingGuests]
  );

  // Group dietary restrictions into categories
  const dietaryCategories: { [key: string]: { count: number; guests: string[] } } = {
    'Vegetarian / Vegan': { count: 0, guests: [] },
    'Gluten-Free': { count: 0, guests: [] },
    'Nut / Peanut Allergy': { count: 0, guests: [] },
    'Dairy-Free / Lactose': { count: 0, guests: [] },
    'Halal / Kosher': { count: 0, guests: [] },
    'Other / Custom Notes': { count: 0, guests: [] },
  };

  const addToCategory = (category: string, g: Guest) => {
    dietaryCategories[category].count += partySize(g);
    dietaryCategories[category].guests.push(`${g.name} (${g.dietary_restrictions})`);
  };

  guestsWithDietary.forEach((g) => {
    const text = g.dietary_restrictions.toLowerCase();
    let categorized = false;

    if (text.includes('veg') || text.includes('vegan')) {
      addToCategory('Vegetarian / Vegan', g);
      categorized = true;
    }
    if (text.includes('gluten') || text.includes('gf') || text.includes('celiac')) {
      addToCategory('Gluten-Free', g);
      categorized = true;
    }
    if (text.includes('nut') || text.includes('peanut')) {
      addToCategory('Nut / Peanut Allergy', g);
      categorized = true;
    }
    if (text.includes('dairy') || text.includes('lactose')) {
      addToCategory('Dairy-Free / Lactose', g);
      categorized = true;
    }
    if (text.includes('halal') || text.includes('kosher')) {
      addToCategory('Halal / Kosher', g);
      categorized = true;
    }
    if (!categorized) {
      addToCategory('Other / Custom Notes', g);
    }
  });

  const dietaryCategoryLabels: Record<string, string> = {
    'Vegetarian / Vegan': t.cateringCatVegetarian,
    'Gluten-Free': t.cateringCatGlutenFree,
    'Nut / Peanut Allergy': t.cateringCatNut,
    'Dairy-Free / Lactose': t.cateringCatDairy,
    'Halal / Kosher': t.cateringCatHalal,
    'Other / Custom Notes': t.cateringCatOther,
  };
  const dietaryCategoryLabel = (cat: string) => dietaryCategoryLabels[cat] ?? cat;

  // Chart data: top 6 dietary categories by guest count
  const dietaryChartData = Object.entries(dietaryCategories)
    .map(([category, info]) => ({ category: dietaryCategoryLabel(category), count: info.count }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Filtered List for Table
  const filteredList = useMemo(
    () =>
      individuals.filter((r) => {
        const g = r.guest;
        const q = searchTerm.toLowerCase();
        const matchesSearch =
          r.name.toLowerCase().includes(q) ||
          g.name.toLowerCase().includes(q) ||
          (g.code || '').toLowerCase().includes(q) ||
          (g.dietary_restrictions || '').toLowerCase().includes(q) ||
          (r.tableName || '').toLowerCase().includes(q);
        const matchesDietary = !filterDietaryOnly || hasDietaryRestriction(g);
        return matchesSearch && matchesDietary;
      }),
    [individuals, searchTerm, filterDietaryOnly]
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor((r) => r.name, {
        id: 'name',
        header: () => <span>{t.guestNameCol}</span>,
        cell: (info) => <span className="font-bold text-[#4A3F35]">{info.getValue()}</span>,
      }),
      columnHelper.accessor((r) => r.guest.name, {
        id: 'group',
        header: () => <span>{t.groupCol}</span>,
        cell: (info) => <span className="text-[#5D5449]">{info.getValue()}</span>,
      }),
      columnHelper.accessor((r) => r.guest.code, {
        id: 'code',
        header: () => <span>{t.reservationCodeCol}</span>,
        cell: (info) => <span className="font-mono text-[#4A3F35]">{info.getValue()}</span>,
      }),
      columnHelper.accessor((r) => partySize(r.guest), {
        id: 'partySize',
        header: () => <span>{t.partySizeCol}</span>,
        cell: (info) => <span className="font-mono text-[#4A3F35]">{info.getValue()} {t.guestSingular}</span>,
      }),
      columnHelper.accessor((r) => (r.guest.dietary_restrictions || '').trim(), {
        id: 'dietary',
        header: () => <span>{t.dietaryCol}</span>,
        cell: (info) => {
          const g = info.row.original.guest;
          const hasRestriction = hasDietaryRestriction(g);
          return hasRestriction ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-bold border border-amber-300">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>{g.dietary_restrictions}</span>
            </span>
          ) : (
            <span className="text-[#8B735B] italic">{t.noDietaryNote}</span>
          );
        },
      }),
      columnHelper.accessor((r) => r.tableName || '', {
        id: 'tableId',
        header: () => <span>{t.tableIdCol}</span>,
        cell: (info) => {
          const r = info.row.original;
          return (
            <span className="font-mono text-[#4A3F35]">
              {r.tableName
                ? `${r.tableName}${r.seatNumber ? ` · ${tf('seatedAtSeatLabel', { seat: String(r.seatNumber) })}` : ''}`
                : t.unassignedWord}
            </span>
          );
        },
      }),
    ],
    [t, tf]
  );

  const table = useReactTable({
    data: filteredList,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleExportCsv = () => {
    if (attendingGuests.length === 0) {
      toast.error(t.cateringNoExportToast);
      return;
    }

    const headers = ['Individual Guest', 'Group / Party', 'Reservation Code', 'Attending Party Size', 'Dietary Restrictions & Allergies', 'Table', 'Seat', 'Contact Email', 'Contact Phone'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = individuals.map((r) => [
      esc(r.name),
      esc(r.guest.name),
      esc(r.guest.code),
      partySize(r.guest),
      esc(r.guest.dietary_restrictions || 'None'),
      esc(r.tableName || t.unassignedWord),
      r.seatNumber ?? '',
      esc(r.guest.email),
      esc(r.guest.phone),
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `catering_dietary_summary_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(t.cateringExportedToast);
  };

  const printManifest = usePrint();

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="card-paper p-6 sm:p-8 bg-gradient-to-br from-[#FFFDF9] to-[#FAF6F0] border border-[#CBAE94]/60 shadow-xs relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFE6DC] text-[#8B735B] font-bold text-xs uppercase tracking-wider font-mono">
              <Utensils className="w-3.5 h-3.5" />
              <span>{t.cateringTitle}</span>
            </div>
            <h2 className="font-newsreader text-3xl font-bold text-[#4A3F35]">
              {t.cateringSummaryHeading}
            </h2>
            <p className="text-xs text-[#8B735B] font-sans max-w-xl">
              {t.cateringSummaryDesc}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-4 py-2.5 rounded-xl bg-white border border-[#CBAE94] text-[#8B735B] font-bold text-xs hover:bg-[#EFE6DC] transition-all flex items-center gap-2 shadow-2xs cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>{t.exportCateringBtn}</span>
            </button>
            <button
              type="button"
              onClick={() => printManifest(t.cateringPrintToast, 300)}
              className="px-4 py-2.5 rounded-xl bg-[#8B735B] text-white font-bold text-xs hover:bg-[#705C47] transition-all flex items-center gap-2 shadow-2xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{t.printManifestBtn}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-paper p-5 flex items-center gap-4 bg-[#FFFDF9] border border-[#CBAE94]/50">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xl border border-amber-300">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-mono text-[#8B735B] uppercase font-bold">{t.totalAttendingLabel}</p>
            <h4 className="text-2xl font-bold font-newsreader text-[#4A3F35]">
              {attendingGuests.length}           <span className="text-xs font-normal text-[#8B735B]">({totalHeadcount} {t.mealsWord} total)</span>
            </h4>
          </div>
        </div>

        <div className="card-paper p-5 flex items-center gap-4 bg-[#FFFDF9] border border-[#CBAE94]/50">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-800 flex items-center justify-center font-bold text-xl border border-rose-300">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-mono text-rose-800 uppercase font-bold">{t.specialDietaryLabel}</p>
            <h4 className="text-2xl font-bold font-newsreader text-[#4A3F35]">
              {guestsWithDietary.length} <span className="text-xs font-normal text-[#8B735B]">{t.guestsWord2}</span>
            </h4>
          </div>
        </div>

        <div className="card-paper p-5 flex items-center gap-4 bg-[#FFFDF9] border border-[#CBAE94]/50">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xl border border-emerald-300">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-mono text-emerald-800 uppercase font-bold">{t.standardMealsLabel}</p>
            <h4 className="text-2xl font-bold font-newsreader text-[#4A3F35]">
              {totalHeadcount - guestsWithDietary.reduce((acc, g) => acc + partySize(g), 0)}{' '}
              <span className="text-xs font-normal text-[#8B735B]">{t.mealsWord}</span>
            </h4>
          </div>
        </div>
      </div>

      {/* Categorized Dietary Manifest */}
      <div className="card-paper p-6 space-y-4">
        <h3 className="font-sans text-lg font-bold text-[#4A3F35] flex items-center gap-2">
          <Utensils className="w-5 h-5 text-[#8B735B]" />
          <span>{t.allergyBreakdownLabel}</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(dietaryCategories).map(([cat, info]) => (
            <div
              key={cat}
              className={`p-4 rounded-2xl border transition-all ${
                info.count > 0 ? 'bg-amber-50/60 border-amber-200' : 'bg-[#FAF6F0]/50 border-[#CBAE94]/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold font-mono text-[#4A3F35]">{dietaryCategoryLabel(cat)}</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
                    info.count > 0 ? 'bg-amber-200 text-amber-900' : 'bg-[#EFE6DC] text-[#8B735B]'
                  }`}
                >
                  {info.count} {t.mealsWord}
                </span>
              </div>

              {info.guests.length > 0 ? (
                <ul className="space-y-1 text-xs text-[#5D5449] font-sans">
                  {info.guests.map((gStr, idx) => (
                    <li key={idx} className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                      <span>{gStr}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[#8B735B] italic font-sans">{t.noGuestsInCategory}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Dietary Breakdown Chart */}
      <div className="card-paper p-6 space-y-4">
        <h3 className="font-sans text-lg font-bold text-[#4A3F35] flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-[#8B735B]" />
          <span>{t.allergyBreakdownLabel} — Top 6</span>
        </h3>
        {dietaryChartData.length === 0 ? (
          <p className="text-xs text-[#8B735B] italic font-sans">{t.noGuestsInCategory}</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dietaryChartData} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} stroke="var(--border)" />
                <YAxis type="category" dataKey="category" width={150} tick={{ fontSize: 11, fill: 'var(--ink)' }} stroke="var(--border)" />
                <Tooltip cursor={{ fill: 'var(--bg-2)' }} contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid var(--border)' }} />
                <Bar dataKey="count" fill="var(--accent)" radius={[0, 8, 8, 0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Guest Dietary Table */}
      <div className="card-paper p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-sans text-lg font-bold text-[#4A3F35]">{tf('cateringManifestTitle', { count: String(filteredList.length) })}</h3>

          <div className="flex items-center gap-2">
            <SearchInput
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t.searchCateringPh}
              className="w-48"
            />

            <button
              type="button"
              onClick={() => setFilterDietaryOnly(!filterDietaryOnly)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                filterDietaryOnly
                  ? 'bg-amber-800 text-white border-amber-800'
                  : 'bg-white text-[#8B735B] border-[#CBAE94] hover:bg-[#EFE6DC]'
              }`}
            >
                {filterDietaryOnly ? t.showingDietaryOnlyBtn : t.dietaryOnlyBtn}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-[#CBAE94]/40 text-[#8B735B] font-mono text-xs uppercase">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        header.column.getIsSorted() === 'asc'
                          ? 'ascending'
                          : header.column.getIsSorted() === 'desc'
                            ? 'descending'
                            : 'none'
                      }
                      className="pb-3 font-bold"
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-[#4A3F35] transition-colors cursor-pointer"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === 'asc' ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : header.column.getIsSorted() === 'desc' ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-60" />
                          )}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-[#CBAE94]/20">
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td colSpan={table.getAllColumns().length} className="py-6 text-center text-[#A09080] font-mono text-xs">
                    {t.noSearchMatch}
                  </td>
                </tr>
              )}
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-[#FAF6F0]/60">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
