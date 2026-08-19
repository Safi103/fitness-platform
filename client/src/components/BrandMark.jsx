// The brand: a stack of plate ends, heaviest (red, 25 kg) first.
export default function BrandMark() {
  return (
    <div className="brand">
      <span className="plate-mark" aria-hidden="true">
        <span className="plate-25" />
        <span className="plate-20" />
        <span className="plate-15" />
        <span className="plate-10" />
      </span>
      <span className="wordmark">Fitness Platform</span>
    </div>
  );
}
