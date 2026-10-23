const sizingNames = ["kb", "mb", "Gb", "Tb", "Pb"];

export const sizeOfBytes = (bytes: bigint, decimals: number): string => {
  if (bytes === BigInt(0)) return "0 Bytes";

  bytes = BigInt(bytes);

  const k = BigInt(1024);
  let currentSize = 0;

  while (bytes > k * k) {
    bytes = (bytes as bigint) / (k as bigint);
    currentSize++;
  }
  return (Number(bytes) / 1024).toFixed(decimals) + sizingNames[currentSize];
};
