import React from 'react';

interface BrandTextProps {
  text: string;
  className?: string;
}

export const BrandText: React.FC<BrandTextProps> = ({ text, className = '' }) => {
  const upperText = text.toUpperCase();
  const tokens = upperText.split(/([AEIOU])/g);

  return (
    <span className={`font-helvetica font-black tracking-tighter uppercase ${className}`}>
      {tokens.map((token, index) => {
        const isVowel = /[AEIOU]/.test(token);
        if (isVowel) {
          return (
            <span 
              key={index} 
              className="font-killigrew lowercase text-brandYellow inline-block transform scale-95 px-[1px]"
            >
              {token}
            </span>
          );
        }
        return <span key={index}>{token}</span>;
      })}
    </span>
  );
};
