import type { ReviewRating } from "../../db/repositories/types";

const labels: ReviewRating[] = ["forgot", "hard", "good", "easy"];

export function RatingButtons({ onRate, suggested }: { onRate: (rating: ReviewRating) => void; suggested?: ReviewRating }) {
  return (
    <div className="rating-row" role="group" aria-label="Rate recall">
      {labels.map((rating) => (
        <button
          className={`btn rating ${rating}${suggested === rating ? " suggested" : ""}`}
          key={rating}
          type="button"
          onClick={() => onRate(rating)}
          title={suggested === rating ? "AI-suggested grade" : undefined}
        >
          {rating[0].toUpperCase() + rating.slice(1)}
          {suggested === rating ? <span className="rating-suggested-dot" aria-label="AI suggestion" /> : null}
        </button>
      ))}
    </div>
  );
}
