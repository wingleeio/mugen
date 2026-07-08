cmake_minimum_required(VERSION 3.22.1)
project(PretextCore)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
# Byte-identical doubles vs JS.
add_compile_options(-ffp-contract=off -fno-fast-math)

# The pretext-core kernel + Nitro HybridObject implementations.
file(GLOB_RECURSE PRETEXT_CORE_SRC CONFIGURE_DEPENDS
  "${CMAKE_CURRENT_SOURCE_DIR}/../cpp/*.cpp")

add_library(PretextCore SHARED ${PRETEXT_CORE_SRC})

target_include_directories(PretextCore PUBLIC
  "${CMAKE_CURRENT_SOURCE_DIR}/../cpp")

# Nitrogen-generated autolinking: pulls in the generated specs, the
# OnLoad bridge, and links NitroModules + fbjni + the JSI runtime.
include(${CMAKE_CURRENT_SOURCE_DIR}/../nitrogen/generated/android/PretextCore+autolinking.cmake)
