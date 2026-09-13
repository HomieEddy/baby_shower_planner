import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, CheckCircle2, Clock, Send, Users, XCircle } from 'lucide-react';
import { EventDetailsCard } from '../rsvp/EventDetailsCard';
import { useT, useTf } from '../shared/i18n';
import { useToast } from '../shared/ToastContext';
import { useAppStore } from '../../stores/appStore';
import { fadeUp } from '../shared/motionPresets';
import { TextInput, Select } from '../shared/ui';
import type { Guest } from '../../types';

const RegisterSchema = z.object({
  name: z.string().min(1),
  email: z.string(),
  phone: z.string(),
  language_pref: z.enum(['EN', 'FR']),
  members: z.array(z.object({ name: z.string(), contact: z.string() })),
  dietary: z.string(),
});
type RegisterFormValues = z.infer<typeof RegisterSchema>;

type RegisterResult = { guest: Guest; already: boolean };

// Universal self-registration: anyone with the /register link confirms their
// group here. The record lands as pending until a host approves it.
export const RegisterPage = () => {
  const t = useT();
  const tf = useTf();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const ref = searchParams.get('ref') || undefined;
  const appLanguage = useAppStore((s) => s.language);

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RegisterResult | null>(null);

  const { register, handleSubmit, control, formState: { errors } } = useForm<RegisterFormValues>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      language_pref: appLanguage,
      members: [],
      dietary: '',
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'members' });

  const onSubmit = async (data: RegisterFormValues) => {
    if (!data.name.trim()) {
      toast.error(t.registerNameRequiredToast);
      return;
    }
    try {
      setSubmitting(true);
      const extras = data.members.filter((m) => m.name.trim() !== '');
      const attendee_names = [data.name.trim(), ...extras.map((m) => m.name.trim())];
      const attendee_details = [
        { name: data.name.trim(), contact: (data.email || data.phone || '').trim() },
        ...extras.map((m) => ({ name: m.name.trim(), contact: m.contact.trim() })),
      ];
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name.trim(),
          email: data.email.trim(),
          phone: data.phone.trim(),
          language_pref: data.language_pref,
          attendee_names,
          attendee_details,
          dietary_restrictions: data.dietary,
          ref,
        }),
      });
      const json = await res.json();
      if (res.ok && json.guest) {
        setResult({ guest: json.guest, already: !!json.already_registered });
      } else {
        toast.error(json.message || t.registerErrorToast);
      }
    } catch {
      toast.error(t.registerErrorToast);
    } finally {
      setSubmitting(false);
    }
  };

  const approval = result?.guest.approval_status;

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-6 max-w-2xl mx-auto">
      <EventDetailsCard
        hideGuestLogin
        actions={
          !showForm && !result ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#8B735B] text-white text-xs font-bold hover:bg-[#4A3F35] transition-colors cursor-pointer"
            >
              <Users className="w-4 h-4" />
              <span>{t.landingRegisterBtn}</span>
            </button>
          ) : null
        }
      />

      {/* Result: pending / approved / rejected / already registered */}
      {result && (
        <div className="card-paper p-6 sm:p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto border border-[#CBAE94] bg-[#EFE6DC]">
            {approval === 'rejected'
              ? <XCircle className="w-7 h-7 text-rose-600" />
              : approval === 'approved'
              ? <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              : <Clock className="w-7 h-7 text-[#8B735B]" />}
          </div>
          <div className="space-y-1.5">
            <h2 className="font-newsreader text-2xl font-bold text-[#4A3F35]">
              {approval === 'rejected' ? t.registerRejectedTitle
                : result.already ? t.registerAlreadyTitle
                : t.registerSuccessTitle}
            </h2>
            <p className="text-xs sm:text-sm text-[#4A3F35]/75 leading-relaxed font-sans">
              {approval === 'rejected' ? t.registerRejectedMsg
                : result.already ? t.registerAlreadyMsg
                : tf('registerSuccessMsg', { code: result.guest.code })}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => navigate(`/rsvp/${result.guest.magic_token}`)}
              className="btn-accent px-5 py-2.5 text-xs font-bold"
            >
              {t.portalContinueBtn}
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn-outline-accent px-5 py-2.5 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t.backHomeBtn}</span>
            </button>
          </div>
        </div>
      )}

      {/* Registration form */}
      {showForm && !result && (
        <div className="card-paper p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-1.5 border-b border-dashed border-[#4A3F35]/20 pb-5">
            <div className="label-mono">{t.registerTitle}</div>
            <h2 className="font-newsreader text-2xl font-bold text-[#4A3F35]">{t.registerFormTitle}</h2>
            <p className="text-xs text-[#4A3F35]/70 font-sans">{t.registerHint}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label-mono block mb-1">{t.fieldName} *</label>
                <TextInput type="text" placeholder={t.nameExamplePh} {...register('name')} />
                {errors.name && <p className="text-rose-600 text-xs">{t.registerNameRequiredToast}</p>}
              </div>
              <div>
                <label className="label-mono block mb-1">{t.fieldLanguage}</label>
                <Select {...register('language_pref')}>
                  <option value="EN">{t.presetEnglish}</option>
                  <option value="FR">{t.presetFrench}</option>
                </Select>
              </div>
              <div>
                <label className="label-mono block mb-1">{t.fieldEmail}</label>
                <TextInput type="email" placeholder={t.emailExamplePh} {...register('email')} />
              </div>
              <div>
                <label className="label-mono block mb-1">{t.fieldPhone}</label>
                <TextInput type="tel" placeholder={t.fieldPhonePlaceholder} {...register('phone')} />
              </div>
            </div>

            <div className="space-y-3 bg-[#E9E0D2]/40 p-4 rounded-2xl border border-[#4A3F35]/20">
              <div>
                <label className="label-mono block">{t.registerMembersTitle}</label>
              </div>
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-start">
                  <TextInput type="text" placeholder={t.registerMemberPh} {...register(`members.${index}.name`)} />
                  <TextInput type="text" placeholder={t.attendeeContactPlaceholder} {...register(`members.${index}.contact`)} />
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="justify-self-start p-2 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors"
                    title={t.removeGuestBtn}
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => append({ name: '', contact: '' })}
                className="w-full py-2.5 rounded-xl border border-dashed border-[#4A3F35]/30 bg-white/80 hover:bg-white text-xs font-bold text-[#4A3F35] transition-colors flex items-center justify-center gap-1.5"
              >
                <Users className="w-4 h-4 text-[#8B735B]" />
                <span>{t.addAnotherGuestBtn}</span>
              </button>
            </div>

            <div>
              <label className="label-mono block mb-1">{t.dietaryLabel}</label>
              <textarea
                rows={2}
                {...register('dietary')}
                placeholder={t.dietaryPlaceholder}
                className="w-full px-4 py-3 rounded-xl border border-[#4A3F35]/20 focus:outline-none focus:ring-2 focus:ring-[#4A3F35] text-sm bg-white text-[#4A3F35]"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <motion.button
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={submitting}
                className="btn-accent flex-1 py-3.5 text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>{submitting ? t.registerSubmittingBtn : t.registerSubmitBtn}</span>
              </motion.button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="btn-outline-accent px-5 py-3.5 text-sm font-bold"
              >
                {t.cancelBtn}
              </button>
            </div>
          </form>
        </div>
      )}

      {!showForm && !result && (
        <p className="text-center">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs font-bold font-mono text-[#8B735B] hover:text-[#D4A373] inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t.backHomeBtn}
          </button>
        </p>
      )}
    </motion.div>
  );
};
