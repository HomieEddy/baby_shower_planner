import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { GiftLog, EventSettings, Guest } from '../../types';
import { Gift, Mail, CheckCircle2, Copy, Sparkles, Trash2, Send, Loader2 } from 'lucide-react';
import { useToast } from '../shared/ToastContext';
import { useConfirm } from '../shared/ConfirmDialog';
import { Modal } from '../shared/Modal';
import { EmptyState } from '../shared/EmptyState';
import { Field, TextInput, Select, SearchInput } from '../shared/ui';
import { GiftLogSchema } from '../../lib/validation';
import { adminFetch } from '../../lib/api';
import { useT } from '../shared/i18n';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

interface ThankYouTrackerViewProps {
  gifts: GiftLog[];
  guests?: Guest[];
  settings?: EventSettings | null;
  onRefreshData: () => void;
}

export const ThankYouTrackerView: React.FC<ThankYouTrackerViewProps> = ({
  gifts,
  guests = [],
  settings,
  onRefreshData,
}) => {
    const t = useT();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'SENT'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [submitting, setSubmitting] = useState(false);

  type GiftFormValues = z.input<typeof GiftLogSchema>;
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<GiftFormValues>({
    resolver: zodResolver(GiftLogSchema),
    defaultValues: {
      guest_name: '',
      guest_id: '',
      gift_description: '',
      category: 'Nursery',
    },
  });

  // AI Draft state
  const [draftGeneratingId, setDraftGeneratingId] = useState<string | null>(null);
  const [sendingThankYou, setSendingThankYou] = useState(false);
  const [draftChannel, setDraftChannel] = useState<'email' | 'text' | 'both'>('email');

  // Selected Draft Modal / Copied Message
  const [activeDraft, setActiveDraft] = useState<{ id: string; guest: string; text: string } | null>(null);

  const parentsNames = settings?.parentsNames || 'Parents';
  const babyName = settings?.babyName || '';

  const handleLogGift = async (values: z.input<typeof GiftLogSchema>) => {
    try {
      setSubmitting(true);
      const res = await adminFetch('/api/gifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, guest_id: values.guest_id || undefined }),
      });

      if (res.ok) {
        toast.love(t.giftLoggedToast);
        reset();
        onRefreshData();
      } else {
        toast.error(t.giftLogFailedToast);
      }
    } catch (err) {
      console.error(err);
      toast.error(t.giftLogErrorToast);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleThankYou = async (giftId: string) => {
    try {
      const res = await adminFetch(`/api/gifts/${giftId}/thankyou`, { method: 'POST' });
      if (res.ok) {
        toast.love(t.thankyouUpdatedToast);
        onRefreshData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteGift = async (giftId: string) => {
    const ok = await confirm({
      title: 'Delete Gift Entry?',
      message: 'Are you sure you want to remove this gift record?',
      confirmText: 'Delete Gift',
    });
    if (!ok) return;
    try {
      const res = await adminFetch(`/api/gifts/${giftId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.info(t.giftRemovedToast);
        onRefreshData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const generateDraft = async (gift: GiftLog) => {
    setDraftGeneratingId(gift.id);
    try {
      const res = await adminFetch(`/api/gifts/${gift.id}/draft`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.draft) {
        setActiveDraft({ id: gift.id, guest: gift.guest_name, text: data.draft });
      } else {
        toast.error(t.aiDraftFailedToast);
        const fallback = `Dear ${gift.guest_name},\n\nThank you so much for the wonderful ${gift.gift_description}! Your thoughtfulness and generosity mean the world to us as we prepare to welcome ${babyName || 'our little one'}. We are so lucky to have you in our lives!\n\nWith love and appreciation,\n${parentsNames}`;
        setActiveDraft({ id: gift.id, guest: gift.guest_name, text: fallback });
      }
    } catch (err) {
      console.error('Draft generation failed:', err);
      toast.error(t.aiDraftFailedToast);
    } finally {
      setDraftGeneratingId(null);
    }
  };

  const handleSendThankYou = async () => {
    if (!activeDraft) return;
    setSendingThankYou(true);
    try {
      const res = await adminFetch(`/api/gifts/${activeDraft.id}/send-thankyou`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: draftChannel, text: activeDraft.text }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.love(t.thankYouSentToast);
        setActiveDraft(null);
        onRefreshData();
      } else if (data.error === 'GUEST_NOT_FOUND') {
        toast.error(t.guestNotFoundError);
      } else if (data.error === 'NO_EMAIL') {
        toast.error(t.noEmailError);
      } else if (data.error === 'NO_PHONE') {
        toast.error(t.noPhoneError);
      } else {
        toast.error(t.thankYouSendErrorToast);
      }
    } catch (err) {
      console.error('Thank-you send failed:', err);
      toast.error(t.thankYouSendErrorToast);
    } finally {
      setSendingThankYou(false);
    }
  };

  const handleCopyDraft = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.love(t.noteCopiedToast);
  };

  // Filtered List
  const filteredGifts = gifts.filter((g) => {
    const matchesSearch =
      g.guest_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.gift_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (g.category || '').toLowerCase().includes(searchTerm.toLowerCase());

    if (filterStatus === 'PENDING') return matchesSearch && !g.thank_you_sent;
    if (filterStatus === 'SENT') return matchesSearch && g.thank_you_sent;
    return matchesSearch;
  });

  const totalGifts = gifts.length;
  const sentCount = gifts.filter((g) => g.thank_you_sent).length;
  const pendingCount = totalGifts - sentCount;
  const percentComplete = totalGifts > 0 ? Math.round((sentCount / totalGifts) * 100) : 0;

  const donutData = [
    { name: t.thankYousCompletedLabel, value: sentCount },
    { name: t.pendingThankYousLabel, value: pendingCount },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Metrics */}
      <div className="card-paper p-6 sm:p-8 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#CBAE94]/30 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFE6DC] text-[#8B735B] font-bold text-xs uppercase tracking-wider font-mono">
              <Mail className="w-3.5 h-3.5" />
              <span>{t.gratitudeTitle}</span>
            </div>
            <h2 className="font-newsreader text-3xl font-bold text-[#4A3F35] mt-1">
              {t.thankYouTrackerTitle}
            </h2>
            <p className="text-xs text-[#8B735B] font-sans">
              {t.thankYouTrackerSubtitle}
            </p>
          </div>
        </div>

        {/* Completion Bar + Donut */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="flex-1 space-y-2">
            <div className="flex justify-between text-xs font-bold text-[#4A3F35] font-mono">
              <span>{t.thankYouProgressLabel}</span>
              <span>
                {sentCount} of {totalGifts} Sent ({percentComplete}%)
              </span>
            </div>
            <div className="w-full bg-[#EFE6DC] h-3.5 rounded-full overflow-hidden border border-[#CBAE94]/40">
              <div
                className="bg-emerald-500 h-full transition-all duration-500 rounded-full"
                style={{ width: `${percentComplete}%` }}
              />
            </div>
          </div>

          <div className="max-w-xs w-full shrink-0">
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={40}
                    outerRadius={62}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    <Cell fill="#10B981" />
                    <Cell fill="#FB7185" />
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #CBAE94' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-4 text-[11px] font-bold text-[#4A3F35] font-mono mt-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                {t.thankYousCompletedLabel} ({sentCount})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                {t.pendingThankYousLabel} ({pendingCount})
              </span>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-4 rounded-xl bg-[#FFFDF9] border border-[#CBAE94]/50 flex items-center justify-between">
            <span className="text-xs font-bold text-[#8B735B] font-mono">{t.totalGiftsLabel}</span>
            <span className="text-xl font-bold text-[#4A3F35]">{totalGifts}</span>
          </div>
          <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 font-mono">{t.thankYousCompletedLabel}</span>
            <span className="text-xl font-bold text-emerald-900">{sentCount}</span>
          </div>
          <div className="p-4 rounded-xl bg-rose-50/60 border border-rose-200 flex items-center justify-between">
            <span className="text-xs font-bold text-rose-800 font-mono">{t.pendingThankYousLabel}</span>
            <span className="text-xl font-bold text-rose-900">{pendingCount}</span>
          </div>
        </div>
      </div>

      {/* Log New Gift Form */}
      <div className="card-paper p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-[#8B735B]" />
          <h3 className="font-sans text-xl font-bold text-[#4A3F35]">{t.logGiftBtn}</h3>
        </div>

        <form onSubmit={handleSubmit(handleLogGift)} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <Field label={t.giftGuestSelectLabel}>
            <Select
              variant="soft"
              required
              {...register('guest_id', {
                onChange: (e) => {
                  const g = guests.find((x) => x.id === e.target.value);
                  setValue('guest_name', g?.name || '');
                },
              })}
            >
              <option value="">{t.giftGuestSelectPh}</option>
              {guests.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                  {g.email ? ` — ${g.email}` : ''}
                  {g.phone ? ` • ${g.phone}` : ''}
                </option>
              ))}
            </Select>
            {errors.guest_name && <p className="text-rose-600 text-[10px] mt-1">{errors.guest_name.message}</p>}
          </Field>

          <Field label={t.giftDescRequired}>
            <TextInput
              variant="soft"
              type="text"
              required
              {...register('gift_description')}
              placeholder={t.giftDescPh}
            />
            {errors.gift_description && <p className="text-rose-600 text-[10px] mt-1">{errors.gift_description.message}</p>}
          </Field>

          <Field label={t.categoryLabel}>
            <Select
              variant="soft"
              {...register('category')}
            >
              <option value="Nursery">{t.catNursery}</option>
              <option value="Clothing">{t.catClothing}</option>
              <option value="Toys">{t.catToys}</option>
              <option value="Feeding">{t.catFeeding}</option>
              <option value="Diapering">{t.catDiapering}</option>
              <option value="Other">{t.catOther}</option>
            </Select>
          </Field>

          <button
            type="submit"
            disabled={submitting}
            className="btn-accent py-2 px-4 text-xs font-bold h-10 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Gift className="w-4 h-4" />
            <span>{submitting ? t.loggingGiftBtn : t.logGiftSubmitBtn}</span>
          </button>
        </form>
      </div>

      {/* Gifts List & Auto-Generated Note Engine */}
      <div className="card-paper p-6 sm:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#CBAE94]/30 pb-3">
          <h3 className="font-sans text-xl font-bold text-[#4A3F35]">
            Gift Log & Note Status ({filteredGifts.length})
          </h3>

          <div className="flex items-center gap-2">
            <SearchInput
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t.searchGiftsPh}
              className="w-40"
            />

            <div className="inline-flex rounded-xl bg-[#EFE6DC] p-1 border border-[#CBAE94]/40 text-xs font-bold">
              <button
                type="button"
                onClick={() => setFilterStatus('ALL')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  filterStatus === 'ALL' ? 'bg-white text-[#4A3F35] shadow-xs' : 'text-[#8B735B]'
                }`}
              >
                {t.filterStatusAll}
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('PENDING')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  filterStatus === 'PENDING' ? 'bg-white text-rose-800 shadow-xs' : 'text-[#8B735B]'
                }`}
              >
                {t.giftFilterPending} ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('SENT')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  filterStatus === 'SENT' ? 'bg-white text-emerald-800 shadow-xs' : 'text-[#8B735B]'
                }`}
              >
                {t.giftFilterSent} ({sentCount})
              </button>
            </div>
          </div>
        </div>

        {filteredGifts.length === 0 ? (
          <EmptyState
            type="generic"
            actionLabel={t.logSampleGiftBtn}
            onAction={() => {
              setValue('guest_name', 'Grandma Ellen');
              setValue('gift_description', 'Handcrafted Baby Shoes & Quilt');
              setValue('category', 'Clothing');
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredGifts.map((gift) => (
              <div
                key={gift.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                  gift.thank_you_sent
                    ? 'bg-emerald-50/50 border-emerald-200'
                    : 'bg-[#FFFDF9] border-[#CBAE94]/60 shadow-xs'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-[#4A3F35]">{gift.guest_name}</h4>
                        <span className="px-2 py-0.5 rounded-md bg-[#EFE6DC] text-[#8B735B] text-[10px] font-bold font-mono">
                          {gift.category}
                        </span>
                      </div>
                      <p className="text-xs text-[#4A3F35]/80 font-sans mt-1 italic">
                        "{gift.gift_description}"
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteGift(gift.id)}
                      className="text-slate-400 hover:text-red-600 transition-colors p-1 cursor-pointer"
                      title={t.deleteGiftTitle2}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#CBAE94]/30 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => generateDraft(gift)}
                    disabled={draftGeneratingId === gift.id}
                    className="px-3 py-1.5 rounded-xl bg-white border border-[#CBAE94] text-[#8B735B] hover:bg-[#EFE6DC] font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-60"
                  >
                    {draftGeneratingId === gift.id ? (
                      <Loader2 className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    )}
                    <span>{draftGeneratingId === gift.id ? t.aiGeneratingBtn : t.autoDraftBtn}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleThankYou(gift.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      gift.thank_you_sent
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-[#8B735B] text-white hover:bg-[#705C47]'
                    }`}
                  >
                    {gift.thank_you_sent ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{t.thankYouSentLabel}</span>
                      </>
                    ) : (
                      <>
                        <Mail className="w-3.5 h-3.5" />
                        <span>{t.markSentBtn}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auto-Draft Modal */}
      <Modal open={!!activeDraft} onClose={() => activeDraft && !sendingThankYou && setActiveDraft(null)} maxWidth="lg"
        title={
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-600" />
            <h3 className="font-sans text-xl font-bold text-[#4A3F35]">
              {t.thankYouModalTitle.replace('{{name}}', activeDraft?.guest || '')}
            </h3>
          </div>
        }>
        <textarea
          rows={6}
          value={activeDraft?.text ?? ''}
          onChange={(e) => activeDraft && setActiveDraft({ ...activeDraft, text: e.target.value })}
          className="w-full p-3.5 rounded-xl border border-[#CBAE94] text-xs font-sans leading-relaxed text-[#4A3F35] bg-[#FAF6F0]"
        />

        <div className="pt-3 border-t border-[#CBAE94]/30">
          <span className="label-mono block text-xs font-bold mb-2">{t.deliveryMethodLabel}</span>
          <div className="inline-flex rounded-xl bg-[#EFE6DC] p-1 border border-[#CBAE94]/40 text-xs font-bold">
            {(['email', 'text', 'both'] as const).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setDraftChannel(ch)}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  draftChannel === ch ? 'bg-[#8B735B] text-white shadow-xs' : 'text-[#8B735B]'
                }`}
              >
                {ch === 'email' ? t.channelEmail : ch === 'text' ? t.channelText : t.channelBoth}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center pt-3">
          <button
            type="button"
            onClick={() => activeDraft && handleCopyDraft(activeDraft.text)}
            className="btn-accent px-4 py-2 text-xs font-bold flex items-center gap-1.5"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{t.copyNoteBtn}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveDraft(null)}
              disabled={sendingThankYou}
              className="px-4 py-2 rounded-xl border border-[#CBAE94] text-xs font-bold text-[#8B735B] disabled:opacity-50"
            >
              {t.closeModal}
            </button>
            <button
              type="button"
              onClick={handleSendThankYou}
              disabled={sendingThankYou || !activeDraft?.text.trim()}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md disabled:opacity-50 cursor-pointer"
            >
              {sendingThankYou ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>{sendingThankYou ? t.thankYouSendingBtn : t.thankYouSendBtn}</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
