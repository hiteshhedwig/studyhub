import type { ReviewRating } from "../../db/repositories/types";

const labels: ReviewRating[] = ["forgot", "hard", "good", "easy"];

export function RatingButtons({ onRate }: { onRate: (rating: ReviewRating) => void }) {
  return (
    <div className="rating-row" role="group" aria-label="Rate recall">
      {labels.map((rating) => (
        <button className={`btn rating ${rating}`} key={rating} type="button" onClick={() => onRate(rating)}>
          {rating[0].toUpperCase() + rating.slice(1)}
        </button>
      ))}
    </div>
  );
}
