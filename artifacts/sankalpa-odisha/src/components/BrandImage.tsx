import { useState, type ImgHTMLAttributes } from 'react';

const GOV_BASE = 'https://sankalpa.odisha.gov.in/Images/';
const LOCAL_BASE = `${import.meta.env.BASE_URL}images/`;

type BrandImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  file: string;
};

export default function BrandImage({ file, ...rest }: BrandImageProps) {
  const [src, setSrc] = useState(`${LOCAL_BASE}${file}`);

  return (
    <img
      {...rest}
      src={src}
      onError={() => {
        const fallback = `${GOV_BASE}${file}`;
        if (src !== fallback) setSrc(fallback);
      }}
    />
  );
}
