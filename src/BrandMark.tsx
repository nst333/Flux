export default function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width="32" height="32" draggable={false} />
    </div>
  );
}
