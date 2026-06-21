"""
Tests for combo product parsing and COGS calculation
"""
import pytest
import sys
sys.path.insert(0, '/app/backend')

from routes.combo_utils import (
    is_combo_product,
    parse_combo_product,
    calculate_combo_cogs,
    normalize_ingredient_name
)


class TestComboDetection:
    """Tests for combo product detection"""
    
    def test_is_combo_product_valid(self):
        """Test that valid combo products are detected"""
        combos = [
            'Coriander and mint leaves (220 gm Pack)-FK : ( Coriander - 120 gm & Mint 100 gm)',
            'Herbs mix(280 gm Pack)-FK : (Curry 60 gm, Coriander 120 gm, Mint 100 gm)',
        ]
        for combo in combos:
            assert is_combo_product(combo), f"Should detect combo: {combo}"
    
    def test_is_combo_product_invalid(self):
        """Test that regular products are not detected as combos"""
        regular = [
            'Tomato',
            'Fresh Coriander (250g)',
            'Palak Leaves',
        ]
        for product in regular:
            assert not is_combo_product(product), f"Should not detect as combo: {product}"


class TestComboParsing:
    """Tests for combo product name parsing"""
    
    def test_parse_combo_1(self):
        """Test parsing Coriander and mint leaves combo"""
        combo = 'Coriander and mint leaves (220 gm Pack)-FK : ( Coriander - 120 gm & Mint 100 gm)'
        result = parse_combo_product(combo)
        
        assert result is not None
        assert result['name'] == 'Coriander and mint leaves'
        assert result['total_weight_gm'] == 220
        assert result['location'] == 'FK'
        assert len(result['ingredients']) == 2
        
        # Check ingredients
        ing_dict = {ing['raw_name'].lower(): ing for ing in result['ingredients']}
        assert 'coriander' in ing_dict
        assert ing_dict['coriander']['weight_gm'] == 120
        assert 'mint' in ing_dict
        assert ing_dict['mint']['weight_gm'] == 100
    
    def test_parse_combo_2(self):
        """Test parsing Herbs mix combo"""
        combo = 'Herbs mix(280 gm Pack)-FK : (Curry 60 gm, Coriander 120 gm, Mint 100 gm)'
        result = parse_combo_product(combo)
        
        assert result is not None
        assert result['name'] == 'Herbs mix'
        assert result['total_weight_gm'] == 280
        assert len(result['ingredients']) == 3
    
    def test_parse_combo_3(self):
        """Test parsing fresh spices mix combo"""
        combo = 'fresh spices mix(620 gm Pack)-FK : (Green chill 100gm, Coriander 120gm, Garlic 200gm, Ginger 200gm)'
        result = parse_combo_product(combo)
        
        assert result is not None
        assert result['name'] == 'fresh spices mix'
        assert result['total_weight_gm'] == 620
        assert len(result['ingredients']) == 4
    
    def test_parse_combo_with_typo(self):
        """Test parsing combo with comma typo before weight"""
        combo = 'Spinach and Coriander leaves(420 gm Pack)-FK : (Coriander 120 gm, Palak, 300 gm)'
        result = parse_combo_product(combo)
        
        assert result is not None
        assert result['name'] == 'Spinach and Coriander leaves'
        assert result['total_weight_gm'] == 420
        assert len(result['ingredients']) == 2
        
        # Verify Palak is correctly parsed despite the comma typo
        ing_dict = {ing['raw_name'].lower(): ing for ing in result['ingredients']}
        assert 'palak' in ing_dict
        assert ing_dict['palak']['weight_gm'] == 300


class TestCogCalculation:
    """Tests for combo COGS calculation"""
    
    def test_calculate_combo_cogs(self):
        """Test COGS calculation for Herbs mix"""
        combo = 'Herbs mix(280 gm Pack)-FK : (Curry 60 gm, Coriander 120 gm, Mint 100 gm)'
        combo_info = parse_combo_product(combo)
        
        # Mock daily COGS map (price per kg)
        daily_cogs_map = {
            ('Curry Leaves', '2026-06-21'): 150,
            ('Coriander', '2026-06-21'): 80,
            ('Fresh Mint Leaves', '2026-06-21'): 200,
        }
        
        result = calculate_combo_cogs(combo_info, daily_cogs_map, '2026-06-21')
        
        # Expected:
        # Curry: 0.06 kg × 150 = 9.0
        # Coriander: 0.12 kg × 80 = 9.6
        # Mint: 0.1 kg × 200 = 20.0
        # Total: 38.6
        
        assert result['total_cogs_per_pack'] == 38.6
        assert len(result['ingredients_breakdown']) == 3


class TestIngredientNormalization:
    """Tests for ingredient name normalization"""
    
    def test_normalize_mint(self):
        assert normalize_ingredient_name('Mint') == 'Fresh Mint Leaves'
        assert normalize_ingredient_name('mint leaves') == 'Fresh Mint Leaves'
    
    def test_normalize_curry(self):
        assert normalize_ingredient_name('Curry') == 'Curry Leaves'
        assert normalize_ingredient_name('curry leaves') == 'Curry Leaves'
    
    def test_normalize_palak(self):
        assert normalize_ingredient_name('Palak') == 'Palak'
        assert normalize_ingredient_name('spinach') == 'Palak'
    
    def test_normalize_green_chilli(self):
        assert normalize_ingredient_name('Green chill') == 'Green Chilli'
        assert normalize_ingredient_name('green chilli') == 'Green Chilli'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
