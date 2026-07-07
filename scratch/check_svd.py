import pickle
from pathlib import Path

svd = pickle.load(open(Path("C:/Users/Machine/Desktop/book_rec/artifacts/svd_model.pkl"), "rb"))
print("Is svd model valid?", svd is not None)
print("Type of user 0 ID:", type(svd.trainset.to_raw_uid(0)))
print("Type of item 0 ID:", type(svd.trainset.to_raw_iid(0)))

pred1 = svd.predict(svd.trainset.to_raw_uid(0), svd.trainset.to_raw_iid(0))
print("Prediction with original types:", pred1.est, "was_impossible:", pred1.details.get('was_impossible', False))

pred2 = svd.predict(str(svd.trainset.to_raw_uid(0)), str(svd.trainset.to_raw_iid(0)))
print("Prediction with str():", pred2.est, "was_impossible:", pred2.details.get('was_impossible', False))
