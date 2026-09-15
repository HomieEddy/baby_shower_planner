import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Guest, FloorMapData } from '../../types';
import { Utensils, Printer, AlertTriangle, CheckCircle2, Users, FileSpreadsheet, ArrowUpDown, ChevronUp, ChevronDown, BarChart3 } from 'lucide-react';
import { useToast } from '../shared/ToastContext';
import { useActionConfirm } from '../shared/ConfirmDialog';
import { useT, useTf } from '../shared/i18n';
import { usePrint } from '../shared/hooks';
import { SearchInput } from '../shared/ui';
import { MetricCard } from '../shared/MetricCard';
import { Segmented } from '../shared/Segmented';
import { ActionsMenu } from '../shared/ActionsMenu';
import { AdminToolbar } from './AdminToolbar';
import { adminContainerVariants } from '../shared/motionPresets';
import { getAttendeeLocations } from '../../lib/tableAssignment';
import { getPartyMembers, getAttendeeDietary, hasDietaryRestriction, isAttending } from '../../lib/guestAttendees';
import { csvCell, toCsv, downloadCsv } from '../../lib/csv';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  createColumnHelper,
  flexRender,
  SortingState,
} from '@tanstack/react-table';
import { Pagination } from '../shared/Pagination';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface CateringSummaryViewProps {
  guests: Guest[];
}

const partySize = (g: Guest) => g.attending_party_size || 1;

interface CateringRow {
  id: string;
  guest: Guest;
  name: string;
  dietary: string;
  tableName: string | null;
  seatNumber: number | null;
}

const columnHelper = createColumnHelper<CateringRow>();

export const CateringSummaryView: React.FC<CateringSummaryViewProps> = ({ guests }) => {
    const t = useT();
    const tf = useTf();
  const { toast } = useToast();
  const confirmAction = useActionConfirm();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDietaryOnly, setFilterDietaryOnly] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
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
    () => guests.filter(isAttending),
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
            dietary: getAttendeeDietary(g, i),
            tableName: loc?.tableName ?? null,
            seatNumber: loc ? loc.seatIndex + 1 : null,
          };
        });
      }),
    [attendingGuests, floorMap, guests]
  );

  // Analyze Dietary Restrictions — one entry per individual with a restriction.
  const individualsWithDietary = useMemo(
    () => individuals.filter((r) => hasDietaryRestriction(r.dietary)),
    [individuals]
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

  const addToCategory = (category: string, row: CateringRow) => {
    dietaryCategories[category].count += 1;
    dietaryCategories[category].guests.push(`${row.name} (${row.dietary})`);
  };

  individualsWithDietary.forEach((row) => {
    const text = row.dietary.toLowerCase();
    let categorized = false;

    if (text.includes('veg') || text.includes('vegan')) {
      addToCategory('Vegetarian / Vegan', row);
      categorized = true;
    }
    if (text.includes('gluten') || text.includes('gf') || text.includes('celiac')) {
      addToCategory('Gluten-Free', row);
      categorized = true;
    }
    if (text.includes('nut') || text.includes('peanut')) {
      addToCategory('Nut / Peanut Allergy', row);
      categorized = true;
    }
    if (text.includes('dairy') || text.includes('lactose')) {
      addToCategory('Dairy-Free / Lactose', row);
      categorized = true;
    }
    if (text.includes('halal') || text.includes('kosher')) {
      addToCategory('Halal / Kosher', row);
      categorized = true;
    }
    if (!categorized) {
      addToCategory('Other / Custom Notes', row);
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
          r.dietary.toLowerCase().includes(q) ||
          (r.tableName || '').toLowerCase().includes(q);
        const matchesDietary = !filterDietaryOnly || hasDietaryRestriction(r.dietary);
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
      columnHelper.accessor((r) => r.dietary.trim(), {
        id: 'dietary',
        header: () => <span>{t.dietaryCol}</span>,
        cell: (info) => {
          const dietary = info.row.original.dietary;
          return hasDietaryRestriction(dietary) ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-bold border border-amber-300">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>{dietary}</span>
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
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const handleExportCsv = async () => {
    if (attendingGuests.length === 0) {
      toast.error(t.cateringNoExportToast);
      return;
    }
    if (!(await confirmAction(t.exportCateringBtn))) return;

    const headers = ['Individual Guest', 'Group / Party', 'Reservation Code', 'Attending Party Size', 'Dietary Restrictions & Allergies', 'Table', 'Seat', 'Contact Email', 'Contact Phone'];
    const esc = csvCell;
    const rows = individuals.map((r) => [
      esc(r.name),
      esc(r.guest.name),
      esc(r.guest.code),
      partySize(r.guest),
      esc(hasDietaryRestriction(r.dietary) ? r.dietary : 'None'),
      esc(r.tableName || t.unassignedWord),
      r.seatNumber ?? '',
      esc(r.guest.email),
      esc(r.guest.phone),
    ]);

    downloadCsv(`catering_dietary_summary_${new Date().toISOString().split('T')[0]}.csv`, toCsv(headers, rows));

    toast.success(t.cateringExportedToast);
  };

  const printManifest = usePrint();

  const standardMeals = totalHeadcount - individualsWithDietary.length;

  return (
    <motion.div variants={adminContainerVariants} initial="hidden" animate="show" className="space-y-6">
      {/* Header Banner */}
      <div className="card-paper p-6 sm:p-8 bg-gradient-to-br from-[#FFFDF9] to-[#FAF6F0] border border-[#CBAE94]/60 shadow-xs relative overflow-hidden">
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
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label={t.totalAttendingLabel}
          value={attendingGuests.length}
          icon={<Users className="w-5 h-5" />}
          iconClass="text-amber-700"
          footer={`${totalHeadcount} ${t.mealsWord}`}
        />
        <MetricCard
          label={t.specialDietaryLabel}
          value={individualsWithDietary.length}
          icon={<AlertTriangle className="w-5 h-5" />}
          iconClass="text-rose-600"
          footer={t.guestsWord2}
        />
        <MetricCard
          label={t.standardMealsLabel}
          value={standardMeals}
          icon={<CheckCircle2 className="w-5 h-5" />}
          iconClass="text-emerald-600"
          footer={t.mealsWord}
        />
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
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold font-mono text-[#4A3F35] min-w-0">{dietaryCategoryLabel(cat)}</span>
                <span
                  className={`shrink-0 whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
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
                <YAxis type="category" dataKey="category" width={110} tick={{ fontSize: 11, fill: 'var(--ink)' }} stroke="var(--border)" />
                <Tooltip cursor={{ fill: 'var(--bg-2)' }} contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid var(--border)' }} />
                <Bar dataKey="count" fill="var(--accent)" radius={[0, 8, 8, 0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Guest Dietary Table */}
      <div className="card-paper p-6 space-y-4">
        <h3 className="font-sans text-lg font-bold text-[#4A3F35]">{tf('cateringManifestTitle', { count: String(filteredList.length) })}</h3>

        <AdminToolbar
          primary={
            <>
              <div className="min-w-0 flex-1">
                <SearchInput
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t.searchCateringPh}
                  aria-label={t.searchCateringPh}
                  className="w-full"
                />
              </div>
              <ActionsMenu
                label={t.actionsLabel}
                items={[
                  { label: t.exportCateringBtn, icon: <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 text-emerald-600" />, onClick: handleExportCsv },
                  { label: t.printManifestBtn, icon: <Printer className="w-3.5 h-3.5 shrink-0" />, onClick: () => printManifest(t.cateringPrintToast, 300) },
                ]}
              />
            </>
          }
          secondary={
            <Segmented
              value={filterDietaryOnly ? 'dietary' : 'all'}
              onChange={(v) => setFilterDietaryOnly(v === 'dietary')}
              options={[
                { value: 'all', label: t.filterAllOption },
                { value: 'dietary', label: t.dietaryOnlyBtn },
              ]}
            />
          }
        />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs font-sans">
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

        <Pagination
          page={pagination.pageIndex + 1}
          totalPages={table.getPageCount()}
          rangeStart={filteredList.length === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1}
          rangeEnd={Math.min((pagination.pageIndex + 1) * pagination.pageSize, filteredList.length)}
          total={filteredList.length}
          onPageChange={(p) => table.setPageIndex(p - 1)}
        />
      </div>
    </motion.div>
  );
};
