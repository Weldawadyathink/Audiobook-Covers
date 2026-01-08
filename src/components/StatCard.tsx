export default function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string | number;
  description?: string;
}) {
  const formattedValue =
    typeof value === "number" ? value.toLocaleString() : value;

  return (
    <div className="bg-slate-800/80 backdrop-blur rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-colors">
      <h3 className="text-sm font-medium text-slate-400 mb-1">{title}</h3>
      <p className="text-2xl font-bold text-white">{formattedValue}</p>
      {description && (
        <p className="text-xs text-slate-500 mt-1">{description}</p>
      )}
    </div>
  );
}

