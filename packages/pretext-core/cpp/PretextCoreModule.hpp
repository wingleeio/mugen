// PretextCoreModule.hpp — the root Nitro HybridObject (`PretextCore`) that
// bridges JS calls onto the pretext kernel and hands back PreparedText /
// PreparedRichInline HybridObjects.
//
// COMPILES ONLY WITHIN THE REACT NATIVE BUILD (nitrogen autolinking): it
// depends on the generated HybridPretextCoreSpec + NitroModules headers, which
// are not present in this host checkout. Default-constructible as required by
// the generated PretextCoreAutolinking.mm (make_shared<PretextCoreModule>()).
#pragma once

#include <memory>
#include <string>
#include <vector>

#include "HybridPretextCoreSpec.hpp"

namespace margelo::nitro::pretextcore {

class PretextCoreModule : public HybridPretextCoreSpec {
 public:
  PretextCoreModule() : HybridObject(TAG) {}

  void registerFont(const std::string& family, double weight,
                    const std::string& style,
                    const std::shared_ptr<ArrayBuffer>& data) override;
  void clearRegisteredFonts() override;
  void setGenericFontFamily(const std::string& generic,
                            const std::string& family) override;
  void setEmojiAdvanceEm(double value) override;
  double measureTextWidth(const std::string& text,
                          const std::string& font) override;
  std::shared_ptr<HybridPreparedTextSpec> prepare(
      const std::string& text, const std::string& font, bool withSegments,
      const std::string& whiteSpace, const std::string& wordBreak,
      double letterSpacing) override;
  std::shared_ptr<HybridPreparedRichInlineSpec> prepareRichInline(
      const std::vector<RichInlineItemSpec>& items) override;
  void clearCache() override;
};

}  // namespace margelo::nitro::pretextcore
