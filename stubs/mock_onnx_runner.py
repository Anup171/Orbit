"""
Mock ONNX runner for backend & queue development (Member 3).
Returns mock building localization masks and 4-class damage predictions
without requiring a trained model checkpoint.
"""
import numpy as np

DAMAGE_CLASSES = ["no-damage", "minor-damage", "major-damage", "destroyed"]

class MockDamageModel:
    def __init__(self, model_path: str = None):
        self.model_path = model_path

    def predict(self, pre_image: np.ndarray, post_image: np.ndarray):
        """
        Simulates model inference.
        Args:
            pre_image: (H, W, 3) pre-disaster RGB image
            post_image: (H, W, 3) post-disaster RGB image
        Returns:
            localization_mask: (H, W) binary mask (1 for building, 0 background)
            damage_probabilities: (H, W, 4) softmax probabilities for damage classes
        """
        h, w = pre_image.shape[:2]
        
        # Mock localization mask with a few simulated buildings
        loc_mask = np.zeros((h, w), dtype=np.uint8)
        loc_mask[100:250, 100:250] = 1
        loc_mask[300:450, 300:450] = 1
        
        # Mock probabilities for 4 classes
        damage_probs = np.zeros((h, w, 4), dtype=np.float32)
        damage_probs[100:250, 100:250] = [0.05, 0.10, 0.25, 0.60]  # Destroyed
        damage_probs[300:450, 300:450] = [0.10, 0.20, 0.55, 0.15]  # Major damage
        damage_probs[loc_mask == 0] = [1.0, 0.0, 0.0, 0.0]        # Background

        return loc_mask, damage_probs

if __name__ == "__main__":
    runner = MockDamageModel()
    dummy_pre = np.zeros((512, 512, 3), dtype=np.uint8)
    dummy_post = np.zeros((512, 512, 3), dtype=np.uint8)
    loc, dmg = runner.predict(dummy_pre, dummy_post)
    print(f"Mock inference successful. Output shapes: loc={loc.shape}, dmg={dmg.shape}")

