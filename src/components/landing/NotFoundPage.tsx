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
      <p className="font-mono text-6xl font-bold text-[#8B735B]">404</p>
      <h1 className="font-gaegu text-3xl font-bold text-[#4A3F35] mt-3">{t.pageNotFoundTitle}</h1>
      <p className="text-sm text-[#5D5449] mt-1">{t.pageNotFoundMsg}</p>
      <Link
        to="/"
        className="btn-accent mt-6 px-6 py-3 text-sm font-bold gap-2"
      >
        <Home className="w-4 h-4" />
        {t.backHomeBtn}
      </Link>
    </motion.div>
  );
};
