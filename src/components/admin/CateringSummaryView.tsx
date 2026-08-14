import React, { useState } from 'react';
import { Guest } from '../../types';
import { Utensils, Printer, AlertTriangle, CheckCircle2, Users, FileSpreadsheet, ArrowUpDown, ChevronUp, ChevronDown, BarChart3 } from 'lucide-react';
import { useToast } from '../shared/ToastContext';
import { useT } from '../shared/i18n';
import { usePrint } from '../shared/hooks';
import { SearchInput } from '../shared/ui';
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

export const CateringSummaryView: React.FC<CateringSummaryViewProps> = ({ guests }) => {
    const t = useT();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDietaryOnly, setFilterDietaryOnly] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);

  // Filter attending guests only for catering
  const attendingGuests = guests.filter((g) => g.rsvp_status === 'Attending');
  const totalHeadcount = attendingGuests.reduce((acc, g) => acc + partySize(g), 0);

  // Analyze Dietary Restrictions
  const guestsWithDietary = attendingGuests.filter(hasDietaryRestriction);

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

  // Chart data: top 6 dietary categories by guest count
  const dietaryChartData = Object.entries(dietaryCategories)
    .map(([category, info]) => ({ category, count: info.count }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Filtered List for Table
  const filteredList = attendingGuests.filter((g) => {
    const matchesSearch =
      g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (g.dietary_restrictions || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (g.table_id || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDietary = !filterDietaryOnly || hasDietaryRestriction(g);
    return matchesSearch && matchesDietary;
  });

  const columnHelper = createColumnHelper<Guest>();

  const columns = [
    columnHelper.accessor((g) => g.name, {
      id: 'name',
      header: () => <span>{t.guestNameCol}</span>,
      cell: (info) => <span className="font-bold text-[#4A3F35]">{info.getValue()}</span>,
    }),
    columnHelper.accessor((g) => partySize(g), {
      id: 'partySize',
      header: () => <span>{t.partySizeCol}</span>,
      cell: (info) => <span className="font-mono text-[#4A3F35]">{info.getValue()} guest(s)</span>,
    }),
    columnHelper.accessor((g) => (g.dietary_restrictions || '').trim(), {
      id: 'dietary',
      header: () => <span>{t.dietaryCol}</span>,
      cell: (info) => {
        const g = info.row.original;
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
    columnHelper.accessor((g) => g.table_id || '', {
      id: 'tableId',
      header: () => <span>{t.tableIdCol}</span>,
      cell: (info) => <span className="font-mono text-[#4A3F35]">{info.getValue() || 'Unassigned'}</span>,
    }),
  ];

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

    const headers = ['Guest Name', 'Attending Party Size', 'Dietary Restrictions & Allergies', 'Table ID', 'Contact Email', 'Contact Phone'];
    const rows = attendingGuests.map((g) => [
      `"${g.name.replace(/"/g, '""')}"`,
      partySize(g),
      `"${(g.dietary_restrictions || 'None').replace(/"/g, '""')}"`,
      `"${g.table_id || 'Unassigned'}"`,
      `"${(g.email || '').replace(/"/g, '""')}"`,
      `"${(g.phone || '').replace(/"/g, '""')}"`,
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
              Catering & Dietary Restrictions Summary
            </h2>
            <p className="text-xs text-[#8B735B] font-sans max-w-xl">
              Comprehensive headcount breakdown and allergy/dietary manifest for your caterers, chef, and banquet team.
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
              {attendingGuests.length} <span className="text-xs font-normal text-[#8B735B]">({totalHeadcount} meals total)</span>
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
                <span className="text-xs font-bold font-mono text-[#4A3F35]">{cat}</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
                    info.count > 0 ? 'bg-amber-200 text-amber-900' : 'bg-[#EFE6DC] text-[#8B735B]'
                  }`}
                >
                  {info.count} {info.count === 1 ? 'meal' : 'meals'}
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
                <p className="text-[11px] text-[#8B735B] italic font-sans">{t.noGuestsInCategory}</p>
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
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#8B735B' }} stroke="#CBAE94" />
                <YAxis type="category" dataKey="category" width={150} tick={{ fontSize: 11, fill: '#4A3F35' }} stroke="#CBAE94" />
                <Tooltip cursor={{ fill: '#FAF6F0' }} contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #CBAE94' }} />
                <Bar dataKey="count" fill="#D97706" radius={[0, 8, 8, 0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Guest Dietary Table */}
      <div className="card-paper p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-sans text-lg font-bold text-[#4A3F35]">Attending Guest Manifest ({filteredList.length})</h3>

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
              {filterDietaryOnly ? 'Showing Dietary Only' : 'Filter Dietary Only'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-[#CBAE94]/40 text-[#8B735B] font-mono text-[11px] uppercase">
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="pb-3 font-bold">
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
