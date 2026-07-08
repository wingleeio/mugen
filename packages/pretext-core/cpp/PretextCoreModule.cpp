// PretextCoreModule.cpp — see header. Compiles only within the RN build.
#include "PretextCoreModule.hpp"

#include <memory>
#include <utility>
#include <vector>

#include "PreparedRichInlineObject.hpp"
#include "PreparedTextObject.hpp"
#include "RichInlineItemSpec.hpp"
#include "jsi_convert.hpp"
#include "pretext/fonts/measure.hpp"
#include "pretext/fonts/registry.hpp"
#include "pretext/layout.hpp"
#include "pretext/rich_inline.hpp"

namespace margelo::nitro::pretextcore {

void PretextCoreModule::registerFont(const std::string& family, double weight,
                                     const std::string& style,
                                     const std::shared_ptr<ArrayBuffer>& data) {
  pretext::fonts::RegisterFontOptions options;
  options.family = pretextcore::u8ToU16(family);
  options.weight = weight;
  options.style = pretextcore::fontStyleFromString(style);
  options.data = data->data();
  options.size = data->size();
  pretext::fonts::registerFont(options);
}

void PretextCoreModule::clearRegisteredFonts() {
  pretext::fonts::clearRegisteredFonts();
}

void PretextCoreModule::setGenericFontFamily(const std::string& generic,
                                             const std::string& family) {
  pretext::fonts::setGenericFontFamily(pretextcore::u8ToU16(generic),
                                       pretextcore::u8ToU16(family));
}

void PretextCoreModule::setEmojiAdvanceEm(double value) {
  pretext::fonts::setEmojiAdvanceEm(value);
}

double PretextCoreModule::measureTextWidth(const std::string& text,
                                           const std::string& font) {
  return pretext::fonts::measureTextWidth(pretextcore::u8ToU16(text),
                                          pretextcore::u8ToU16(font));
}

std::shared_ptr<HybridPreparedTextSpec> PretextCoreModule::prepare(
    const std::string& text, const std::string& font, bool withSegments,
    const std::string& whiteSpace, const std::string& wordBreak,
    double letterSpacing) {
  pretext::PrepareOptions options;
  options.whiteSpace = pretextcore::whiteSpaceModeFromString(whiteSpace);
  options.wordBreak = pretextcore::wordBreakModeFromString(wordBreak);
  options.letterSpacing = letterSpacing;

  std::u16string text16 = pretextcore::u8ToU16(text);
  std::u16string font16 = pretextcore::u8ToU16(font);
  pretext::PreparedPtr prepared =
      withSegments ? pretext::prepareWithSegments(text16, font16, options)
                   : pretext::prepare(text16, font16, options);
  return std::make_shared<PreparedTextObject>(std::move(prepared));
}

std::shared_ptr<HybridPreparedRichInlineSpec>
PretextCoreModule::prepareRichInline(
    const std::vector<RichInlineItemSpec>& items) {
  std::vector<pretext::RichInlineItem> kernelItems;
  kernelItems.reserve(items.size());
  for (const auto& it : items) {
    pretext::RichInlineItem item;
    item.text = pretextcore::u8ToU16(it.text);
    item.font = pretextcore::u8ToU16(it.font);
    item.letterSpacing = it.letterSpacing;
    item.breakNever = it.breakNever;
    item.extraWidth = it.extraWidth;
    kernelItems.push_back(std::move(item));
  }
  pretext::PreparedRichInlinePtr prepared =
      pretext::prepareRichInline(kernelItems);
  return std::make_shared<PreparedRichInlineObject>(std::move(prepared));
}

void PretextCoreModule::clearCache() { pretext::clearCache(); }

}  // namespace margelo::nitro::pretextcore
