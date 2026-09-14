import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Home } from 'lucide-react';
import { useT } from '../shared/i18n';
import { fadeUp } from '../shared/motionPresets';

export const NotFoundPage = () => {
  const t = useT();

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="w-full max-w-sm mx-auto pt-12 sm:pt-20 text-center"
    >
      <p className="font-mono text-6xl font-bold text-[#CBAE94]">404</p>
      <h1 className="font-newsreader text-2xl font-bold text-[#4A3F35] mt-3">{t.pageNotFoundTitle}</h1>
      <p className="text-sm text-[#A09080] mt-1 font-mono">{t.pageNotFoundMsg}</p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#8B735B] text-white font-bold text-sm hover:bg-[#4A3F35] transition-colors"
      >
        <Home className="w-4 h-4" />
        {t.backHomeBtn}
      </Link>
    </motion.div>
  );
};
