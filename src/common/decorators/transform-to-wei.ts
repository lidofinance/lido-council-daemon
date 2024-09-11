import { Transform } from 'class-transformer';
import { ethers } from 'ethers';

export function TransformToWei() {
  return Transform(
    ({ value }) => {
      try {
        const weiValue = ethers.utils.parseEther(value);
        return weiValue;
      } catch (error) {
        return NaN;
      }
    },
    { toClassOnly: true },
  );
}
